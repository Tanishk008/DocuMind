const fs = require('fs');
async function test() {
  const formData = new FormData();
  formData.append('question', 'What is this document about?');
  // Just send an empty file or dummy test file
  const blob = new Blob(['Hello World this is a test document about bananas'], { type: 'text/plain' });
  formData.append('files', blob, 'test.txt');

  const res = await fetch('http://localhost:3000/api/analyze', {
    method: 'POST',
    body: formData
  });
  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Data:', JSON.stringify(data, null, 2));
}
test();
