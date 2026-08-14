import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSampleEvent } from '../src/domain/sample';
import { MapCanvas } from '../src/components/MapCanvas';
import { createStationMarkerContent } from '../src/components/station-marker';
import { EditorApp } from '../src/editor/EditorApp';
import { grantEditorSession } from '../src/storage/auth';
import { clearDraft } from '../src/storage/draft-store';
import { saveParticipantHistory } from '../src/storage/participant-history';

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await clearDraft();
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
    fireEvent.click(screen.getByRole('button', { name: '新建参与人' }));
    const nameInput = screen.getByDisplayValue('新参与人');

    fireEvent.focus(nameInput);
    expect(nameInput).toHaveValue('');

    fireEvent.change(nameInput, { target: { value: '未命名' } });
    fireEvent.blur(nameInput);
    fireEvent.focus(nameInput);
    expect(nameInput).toHaveValue('未命名');
  });

  it('filters historical participants by initial and adds one with a new id', async () => {
    grantEditorSession();
    saveParticipantHistory([
      { name: '张三', note: '同学', lastUsedAt: 20 },
      { name: '白露', lastUsedAt: 10 },
    ]);
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    fireEvent.click(screen.getByRole('button', { name: '添加参与人' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 Z 开头的参与人' }));

    expect(screen.queryByRole('button', { name: /白露/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加历史参与人 张三，同学' }));
    expect(screen.getByLabelText('参与人姓名：张三')).toHaveValue('张三');
    expect(screen.getByRole('button', { name: '已添加 张三，同学' })).toBeDisabled();
  });
});
