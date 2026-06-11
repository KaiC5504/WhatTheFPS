import '@testing-library/jest-dom/vitest';

// jsdom (this version) ships File/Blob without arrayBuffer(); SpecsCard's report
// import reads dropped files that way. Polyfill from FileReader when it's missing.
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
