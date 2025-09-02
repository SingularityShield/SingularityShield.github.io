// assets/js/copy-code.js
document.addEventListener('DOMContentLoaded', () => {
  const codeBlocks = document.querySelectorAll('pre');
  codeBlocks.forEach((block) => {
    const button = document.createElement('button');
    button.className = 'copy-btn';
    button.textContent = 'Copy';
    button.onclick = function () {
      const code = block.querySelector('code').innerText;
      navigator.clipboard.writeText(code);
      button.textContent = 'Copied!';
      setTimeout(() => button.textContent = 'Copy', 2000);
    };
    block.style.position = 'relative';
    block.insertBefore(button, block.firstChild);
  });
});