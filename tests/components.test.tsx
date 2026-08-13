import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { MapCanvas } from '../src/components/MapCanvas';

describe('map components', () => {
  it('renders station table markers and opens a station callback', async () => {
    let selected = '';
    render(
      <div style={{ height: 600 }}>
        <MapCanvas
          event={createSampleEvent()}
          onSelectStation={(id) => {
            selected = id;
          }}
        />
      </div>,
    );
    expect(await screen.findByRole('button', { name: /老街火锅/ })).toBeInTheDocument();
    expect(screen.getByText('14:30–16:30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /老街火锅/ }));
    expect(selected).toBe('s_hotpot');
    expect(screen.getByText('待定')).toBeInTheDocument();
  });
});
