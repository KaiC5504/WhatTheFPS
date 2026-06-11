import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NerdView } from './NerdView';
import { analyze } from '../engine/analyze';
import { fixtureResult } from './_fixtures';
import { instances, resetUplotMock } from './timeline/_uplotMock';

vi.mock('uplot', async () => {
  const mock = await import('./timeline/_uplotMock');
  return { default: mock.FakeUPlot };
});

// A small but representative log: cpu/gpu temps + clocks + usage, both FPS columns,
// and two flag columns (one throttle, one perf-limit) with some "Yes" samples.
const csv = [
  'Date,Time,"Total CPU Usage [%]","CPU Package [°C]","Core Clocks (avg) [MHz]","GPU Temperature [°C]","GPU Hot Spot Temperature [°C]","GPU Core Load [%]","GPU Clock [MHz]","Framerate Displayed (avg) [FPS]","Framerate Presented (avg) [FPS]","Core Thermal Throttling (avg) [Yes/No]","Performance Limit - Utilization [Yes/No]",',
  '9.6.2026,12:00:00.000,45.0,70.0,4500.0,75.0,82.0,99.0,2400.0,120.0,122.0,No,Yes,',
  '9.6.2026,12:00:02.000,55.0,72.0,4600.0,77.0,85.0,98.0,2460.0,118.0,121.0,Yes,Yes,',
  '9.6.2026,12:00:04.000,50.0,71.0,4550.0,76.0,84.0,97.0,2430.0,119.0,120.0,Yes,Yes,',
].join('\n');

function build() {
  return analyze(new TextEncoder().encode(csv));
}

function timedFixture() {
  const result = fixtureResult();
  result.log.timesMs = [0, 2000, 4000, 6000, 8000];
  return result;
}

beforeEach(() => resetUplotMock());

describe('NerdView', () => {
  it('renders the per-sensor stats table with sensor labels', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();
    expect(screen.getByText('GPU Temperature')).toBeInTheDocument();
    expect(screen.getByText('CPU Package')).toBeInTheDocument();
  });

  it('renders fan rows for laptop-EC bare-name fan tachs', () => {
    const fanCsv = [
      'Date,Time,"CPU [RPM]","GPU [RPM]","GPU [RPM]","CPU Package [°C]",',
      '9.6.2026,12:00:00.000,3540,2340,3300,70.0,',
      '9.6.2026,12:00:02.000,3600,5100,4980,72.0,',
    ].join('\n');
    render(<NerdView result={analyze(new TextEncoder().encode(fanCsv))} />);
    expect(screen.getByText('CPU Fan (max)')).toBeInTheDocument();
    expect(screen.getByText('GPU Fan (max)')).toBeInTheDocument();
  });

  it('shows the presented-vs-displayed framerate split', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('Framerate detail')).toBeInTheDocument();
    expect(screen.getByText('Displayed avg')).toBeInTheDocument();
    expect(screen.getByText('Presented avg')).toBeInTheDocument();
  });

  it('counts throttle and performance-limit flags', () => {
    render(<NerdView result={build()} />);
    expect(screen.getByText('CPU Thermal Throttling')).toBeInTheDocument();
    expect(screen.getByText('GPU Perf Limit Utilization')).toBeInTheDocument();
    // thermal throttle fired on 2 of 3 samples
    expect(screen.getByText('2 of 3')).toBeInTheDocument();
  });

  it('nerd view shows timeline, worst moments, core grid and badges', () => {
    const result = timedFixture();
    result.log.cores = { usage: [{ label: 'Core 0 T0', coreType: 'std', coreIndex: 0, thread: 0, values: [50, 60] }], effectiveClock: [] };
    render(<NerdView result={result} />);
    expect(screen.getByText('Session timeline')).toBeInTheDocument();
    expect(screen.getByText('Worst moments')).toBeInTheDocument();
    expect(screen.getByText('Per-thread CPU usage')).toBeInTheDocument();
    expect(screen.getByText('Per-sensor statistics')).toBeInTheDocument();
  });

  it('brushing the timeline shows the selection panel; clearing hides it', () => {
    render(<NerdView result={timedFixture()} />);
    expect(screen.queryByText('Selection')).not.toBeInTheDocument();

    // 600 px chart over 0–8 s: px 150–450 = 2 s–6 s → rows 1–3
    act(() => instances[0].fireSelect(150, 300));
    expect(screen.getByText('Selection')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear selection/i }));
    expect(screen.queryByText('Selection')).not.toBeInTheDocument();
  });

  it('the From/To inputs reach the same selection panel (keyboard path)', () => {
    render(<NerdView result={timedFixture()} />);
    fireEvent.change(screen.getByLabelText(/^from/i), { target: { value: '0:02' } });
    fireEvent.change(screen.getByLabelText(/^to/i), { target: { value: '0:06' } });
    fireEvent.click(screen.getByRole('button', { name: /select range/i }));
    expect(screen.getByText('Selection')).toBeInTheDocument();
  });
});
