import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConnectionStatusBadge } from '../ConnectionStatusBadge';

describe('ConnectionStatusBadge', () => {
  it('renders "Active" for active status', () => {
    render(<ConnectionStatusBadge status="active" />);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders "Expired" for expired status', () => {
    render(<ConnectionStatusBadge status="expired" />);
    expect(screen.getByText('Expired')).toBeInTheDocument();
  });

  it('renders "Disconnected" for disconnected status', () => {
    render(<ConnectionStatusBadge status="disconnected" />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('applies green classes for active status', () => {
    const { container } = render(<ConnectionStatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-green-100');
    expect(badge.className).toContain('text-green-800');
  });

  it('applies red classes for expired status', () => {
    const { container } = render(<ConnectionStatusBadge status="expired" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-red-100');
    expect(badge.className).toContain('text-red-800');
  });

  it('applies gray classes for disconnected status', () => {
    const { container } = render(<ConnectionStatusBadge status="disconnected" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('bg-gray-100');
    expect(badge.className).toContain('text-gray-600');
  });

  it('renders as a Badge (has border classes)', () => {
    const { container } = render(<ConnectionStatusBadge status="active" />);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border-green-200');
  });
});
