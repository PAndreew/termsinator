import { render } from 'preact';
import { App } from './App';

const mount = document.getElementById('app');
if (mount) render(<App />, mount);
