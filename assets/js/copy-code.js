// assets/js/copy-code.js
function copyCode(button) {
  const code = button.nextElementSibling.innerText;
  navigator.clipboard.writeText(code);
  button.textContent = "Copied!";
  setTimeout(() => button.textContent = "Copy", 2000);
}