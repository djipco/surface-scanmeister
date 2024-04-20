import {App} from './App.js';

const run = async () => {
  const app = new App();

  const buttons = document.getElementsByTagName("button");

  for (let i = 0; i < buttons.length; i++) {
    const button = buttons[i];
    button.addEventListener('click', () => app.getImage(button.innerText));
  }

};

run();
