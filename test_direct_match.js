const { findDirectAnswer } = require('./ai');

const mockRawData = [
    { Question: "Berapa biaya paspor?", Answer: "Biaya paspor adalah Rp 350.000 untuk paspor biasa." },
    { Question: "Bagaimana cara perpanjang paspor?", Answer: "Gunakan aplikasi M-Paspor untuk mendaftar." }
];

const test1 = findDirectAnswer("biaya paspor", mockRawData);
console.log("Test 1 (Match):", test1);

const test2 = findDirectAnswer("cara daftar paspor", mockRawData);
console.log("Test 2 (Match):", test2);

const test3 = findDirectAnswer("siapa presiden", mockRawData);
console.log("Test 3 (No Match):", test3);
