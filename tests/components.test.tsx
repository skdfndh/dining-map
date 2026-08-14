import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { MapCanvas } from '../src/components/MapCanvas';
import { createStationMarkerContent } from '../src/components/station-marker';
import { EditorApp } from '../src/editor/EditorApp';
import { grantEditorSession } from '../src/storage/auth';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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

  it('renders imported marker text without interpreting HTML', () => {
    const station = createSampleEvent().stations[0];
    station.shortName = '<img src=x onerror=alert(1)>危险店名';

    const marker = createStationMarkerContent(station, -1);

    expect(marker.querySelector('img')).toBeNull();
    expect(marker.textContent).toContain('<img src=x onerror=alert(1)>危险店名');
    expect(marker.querySelector('b')?.textContent).toBe('待');
  });
});

describe('editor participants', () => {
  it('clears a generated participant name only on its first focus', async () => {
    grantEditorSession();
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    fireEvent.click(screen.getByRole('button', { name: '添加参与人' }));
    const nameInput = screen.getByDisplayValue('新参与人');

    fireEvent.focus(nameInput);
    expect(nameInput).toHaveValue('');

    fireEvent.change(nameInput, { target: { value: '未命名' } });
    fireEvent.blur(nameInput);
    fireEvent.focus(nameInput);
    expect(nameInput).toHaveValue('未命名');
  });
});
