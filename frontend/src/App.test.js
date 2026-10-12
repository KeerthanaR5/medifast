import { render, screen } from '@testing-library/react';
import App from './App';

test('renders app loading state', () => {
  render(<App />);
  expect(screen.getByText(/MediFast/i)).toBeInTheDocument();
  expect(screen.getByText(/Initializing application/i)).toBeInTheDocument();
});
