import { createRoot } from 'react-dom/client';

import { App } from './componenets/App';

const container = document.getElementById('root') as HTMLElement;
const root = createRoot(container);
root.render(<App />);
