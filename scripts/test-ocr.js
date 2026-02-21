const { createWorker } = require('tesseract.js');

async function test() {
  console.log('Testing Tesseract.js (no custom config)...');

  try {
    // Don't pass custom worker paths - let tesseract.js use defaults
    const worker = await createWorker("eng", 1, {
      logger: m => console.log(m.status, m.progress ? Math.round(m.progress * 100) + '%' : ''),
    });

    console.log('Worker created successfully!');

    // Test with a simple image URL
    const { data: { text } } = await worker.recognize('https://tesseract.projectnaptha.com/img/eng_bw.png');
    console.log('OCR Result:', text.substring(0, 100));

    await worker.terminate();
    console.log('Test passed!');
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
