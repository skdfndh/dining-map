import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: '编辑参与人' }));
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

  it('opens the draft box as a dialog and closes it with Escape', async () => {
    grantEditorSession();
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    fireEvent.click(screen.getByRole('button', { name: '草稿箱' }));
    expect(await screen.findByRole('dialog', { name: '草稿箱' })).toBeVisible();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '草稿箱' })).not.toBeInTheDocument();
  });

  it('filters historical participants by initial and adds one with a new id', async () => {
    grantEditorSession();
    saveParticipantHistory([
      { name: '张三', note: '同学', lastUsedAt: 20 },
      { name: '白露', lastUsedAt: 10 },
    ]);
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    fireEvent.click(screen.getByRole('button', { name: '编辑参与人' }));
    fireEvent.click(screen.getByRole('button', { name: '添加参与人' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 Z 开头的参与人' }));

    expect(screen.queryByRole('button', { name: /白露/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加历史参与人 张三，同学' }));
    expect(screen.getByLabelText('参与人姓名：张三')).toHaveValue('张三');
    expect(screen.getByRole('button', { name: '已添加 张三，同学' })).toBeDisabled();
  });

  it('keeps participants compact until the focused editor is opened', async () => {
    grantEditorSession();
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    const editButton = screen.getByRole('button', { name: '编辑参与人' });
    const firstParticipantName = createSampleEvent().participants[0].name;
    expect(screen.getByLabelText('当前参与人')).toHaveTextContent(firstParticipantName);
    expect(screen.queryByRole('dialog', { name: '参与人名单' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(`参与人姓名：${firstParticipantName}`)).not.toBeInTheDocument();

    fireEvent.click(editButton);
    expect(screen.getByRole('dialog', { name: '参与人名单' })).toBeVisible();
    expect(screen.getByLabelText(`参与人姓名：${firstParticipantName}`)).toHaveValue(
      firstParticipantName,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: '参与人名单' })).not.toBeInTheDocument();
    await waitFor(() => expect(editButton).toHaveFocus());
  });
});

describe('editor publication validation', () => {
  it('highlights and focuses the activity name when export is blocked', async () => {
    grantEditorSession();
    render(<EditorApp />);

    await screen.findByText('草稿已保存');
    const titleInput = screen.getByLabelText('活动名称');
    fireEvent.change(titleInput, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '费用' }));
    fireEvent.click(screen.getByRole('button', { name: 'JSON' }));

    expect(screen.getByRole('alert')).toHaveTextContent('还有 1 项阻断错误');
    expect(screen.getByRole('alert')).toHaveTextContent('活动名称不能为空');
    expect(screen.getByRole('button', { name: '活动' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /活动名称不能为空.*定位修改/ })).toBeVisible();
    const focusedTitleInput = screen.getByRole('textbox', { name: /^活动名称/ });
    await waitFor(() => expect(focusedTitleInput).toHaveFocus());
    expect(focusedTitleInput).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(focusedTitleInput, { target: { value: '补充后的聚餐名称' } });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(focusedTitleInput).toHaveAttribute('aria-invalid', 'false');
  });
});
