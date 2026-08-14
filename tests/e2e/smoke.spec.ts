import { expect, test } from '@playwright/test';
import { createSampleEvent } from '../../src/domain/sample';
import { exportEventJson } from '../../src/export/data';
import { encryptEventJson } from '../../src/export/encryption';

const VIEWER_TEST_PASSWORD = 'test-only-password-123';

test('viewer shows map-first activity and expenses', async ({ page }) => {
  const event = createSampleEvent();
  const envelope = await encryptEventJson(exportEventJson(event), VIEWER_TEST_PASSWORD);
  await page.route('**/event.enc.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(envelope),
    }),
  );
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '打开这份聚餐邀请' })).toBeVisible();
  await page.getByLabel('查看密码').fill(VIEWER_TEST_PASSWORD);
  await page.getByRole('button', { name: '解锁聚餐地图' }).click();
  await expect(page.getByRole('heading', { name: '秋日朋友聚餐' })).toBeVisible();
  await page.getByRole('button', { name: '我是谁', exact: true }).click();
  await expect(page.getByRole('heading', { name: '我是谁' })).toBeVisible();
  await page.getByRole('button', { name: /小王/ }).click();
  await expect(page.getByText('正在以 小王 的身份查看')).toBeVisible();
  await expect(page.locator('.amap-table-marker.is-mine')).toHaveCount(3);
  await expect(page.locator('.amap-table-marker.not-mine')).toHaveCount(1);
  const firstStation = event.stations.find((station) => station.id === 's_hotpot')!;
  await page.locator('.amap-table-marker').filter({ hasText: firstStation.shortName }).click();
  await expect(page.getByRole('heading', { name: '老街火锅馆' })).toBeVisible();
  await expect(page.getByText('小王 · 我')).toBeVisible();
  await expect(page.getByText('小王参加这一站')).toBeVisible();
  const amapHref = await page.getByRole('link', { name: '高德导航' }).getAttribute('href');
  expect(amapHref).not.toBeNull();
  const amapNavigation = new URL(amapHref!);
  expect(amapNavigation.searchParams.get('from')).toBe('');
  expect(amapNavigation.searchParams.get('to')).toBe(
    `${firstStation.coordinate.lng},${firstStation.coordinate.lat},${firstStation.name}`,
  );
  expect(amapNavigation.searchParams.get('callnative')).toBe('1');
  const baiduNavigation = page.getByRole('link', { name: '百度导航' });
  await expect(baiduNavigation).toHaveAttribute('href', /output=html/);
  await expect(baiduNavigation).toHaveAttribute('href', /src=webapp\.skdfndh\.diningmap/);
  await page.getByRole('button', { name: '关闭地点详情' }).click();
  await page.getByRole('button', { name: /费用/ }).click();
  await expect(page.getByRole('heading', { name: '聚餐费用' })).toBeVisible();
  await expect(page.locator('.who-am-i select')).toHaveValue('p_wang');
});

test('editor login gate opens the workspace', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();
  await expect(page.getByRole('heading', { name: /聚餐地图 · 行程编排台/ })).toBeVisible();
});

test('editor locates a blocking publication error and focuses its field', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();

  const titleInput = page.getByLabel('活动名称');
  await titleInput.fill('');
  await page.getByRole('button', { name: '费用', exact: true }).click();
  await page.getByRole('button', { name: '明文备份', exact: true }).click();

  const blockingAlert = page.getByRole('alert');
  await expect(blockingAlert).toContainText('还有 1 项阻断错误');
  await expect(blockingAlert).toContainText('活动名称不能为空');
  await expect(page.getByRole('button', { name: '活动', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(titleInput).toBeFocused();
  await expect(titleInput).toHaveAttribute('aria-invalid', 'true');

  await titleInput.fill('已修正的聚餐名称');
  await expect(blockingAlert).toHaveCount(0);
});

test('editor highlights expenses and starts a blank activity', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();
  await page.getByLabel('活动名称').fill('待恢复的周末聚餐');
  await expect(page.locator('.map-sdk .amap-maps')).toBeVisible();
  await page.evaluate(() => {
    const testWindow = window as unknown as {
      AMap: {
        Map: {
          prototype: {
            setZoomAndCenter: (zoom: number, center: [number, number]) => void;
          };
        };
      };
      __areaCenterCalls?: [number, number][];
    };
    const prototype = testWindow.AMap.Map.prototype;
    const originalSetZoomAndCenter = prototype.setZoomAndCenter;
    testWindow.__areaCenterCalls = [];
    prototype.setZoomAndCenter = function setZoomAndCenter(zoom: number, center: [number, number]) {
      testWindow.__areaCenterCalls?.push(center);
      originalSetZoomAndCenter.call(this, zoom, center);
    };
  });

  const expenseTab = page.getByRole('button', { name: '费用', exact: true });
  await expenseTab.click();
  await expect(expenseTab).toHaveAttribute('aria-current', 'page');
  await expect(expenseTab).toHaveClass(/active/);
  await expect(expenseTab).toHaveCSS('background-color', 'rgba(217, 75, 50, 0.14)');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '新建聚餐' }).click();
  await expect(page.getByLabel('活动名称')).toHaveValue('');
  await expect(page.getByRole('button', { name: '活动', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByText(/已新建空白聚餐/)).toBeVisible();
  await page.getByLabel('省份').selectOption({ label: '广东省' });
  await expect(page.getByLabel('城市')).toHaveValue('440100');
  await page.getByLabel('区县（可选）').selectOption({ label: '天河区' });
  await expect(page.getByText(/广东省 · 广州市 · 天河区/)).toBeVisible();
  await expect(page.getByText(/地图将以/)).toBeVisible();
  await expect(page.locator('.helper-message')).toHaveText(
    /地图已大概定位到天河区|暂时无法定位该行政区/,
    { timeout: 15000 },
  );
  await expect
    .poll(() =>
      page.evaluate(() => {
        const calls = (window as unknown as { __areaCenterCalls?: [number, number][] })
          .__areaCenterCalls;
        return Boolean(
          calls?.some(
            ([lng, lat]) =>
              Math.abs(lng - 113.280637) < 0.000001 && Math.abs(lat - 23.125178) < 0.000001,
          ),
        );
      }),
    )
    .toBe(true);
  await expect(page.locator('.map-sdk .amap-maps')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '恢复上个活动' }).click();
  await expect(page.getByLabel('活动名称')).toHaveValue('待恢复的周末聚餐');
});

test('editor quickly deletes a station from the unscheduled area', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();
  await page.getByRole('button', { name: '按时间重新排序' }).click();

  const deleteButton = page.getByRole('button', { name: '删除待安排地点 江边散步' });
  await expect(deleteButton).toBeVisible();
  await deleteButton.click();

  await expect(deleteButton).not.toBeVisible();
  await expect(page.locator('.map-station-marker', { hasText: '江边散步' })).toHaveCount(0);
});

test('editor bulk-fills only sortable stations while preserving manual order', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();
  await page.getByRole('button', { name: '按时间重新排序' }).click();
  await page.locator('.unscheduled-main', { hasText: '江边散步' }).click();
  await page.getByRole('button', { name: '时段', exact: true }).click();

  const fillButton = page.getByRole('button', { name: /一键填入\s*1/ });
  await expect(fillButton).toBeEnabled();
  await fillButton.click();

  await expect(page.locator('.itinerary-flow .flow-station strong')).toHaveText([
    '檐下咖啡',
    '夜猫 KTV',
    '老街火锅',
    '江边散步',
  ]);
  await expect(page.getByRole('button', { name: '一键填入', exact: true })).toBeDisabled();
});

test('editor automatically processes a selected cycling route', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();

  await page.locator('.flow-route').first().click();
  await page.getByLabel('交通方式').selectOption('cycling');

  const status = page.locator('.route-stats dd').first();
  await expect(status).toHaveText(/已冻结|虚线降级/, { timeout: 15000 });
  await expect(page.locator('.flow-route').first()).toHaveText(/骑行/);

  if ((await status.textContent())?.includes('已冻结')) {
    await expect(page.locator('.route-stats').getByText(/km/)).not.toHaveText('—');
    await expect(page.locator('.route-stats').getByText(/分钟/)).not.toHaveText('—');
  } else {
    await expect(page.locator('.flow-route').first()).toHaveText(/算路失败/);
  }
});

test('editor filters and adds a historical participant by initial', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'dining-map:participant-history',
      JSON.stringify([
        { name: '张三', note: '高中同学', lastUsedAt: 2 },
        { name: '白露', lastUsedAt: 1 },
      ]),
    );
  });
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();

  await expect(page.getByLabel('当前参与人')).toBeVisible();
  await expect(page.getByLabel(/参与人姓名/)).toHaveCount(0);
  await page.getByRole('button', { name: '编辑参与人' }).click();
  await expect(page.getByRole('dialog', { name: '参与人名单' })).toBeVisible();
  await page.getByRole('button', { name: '添加参与人' }).click();
  await page.getByRole('button', { name: '查看 Z 开头的参与人' }).click();
  await expect(page.getByRole('button', { name: /白露/ })).toHaveCount(0);
  await page.getByRole('button', { name: '添加历史参与人 张三，高中同学' }).click();

  await expect(page.getByLabel('参与人姓名：张三')).toHaveValue('张三');
  await expect(page.getByRole('button', { name: '已添加 张三，高中同学' })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: '参与人名单' })).toHaveCount(0);
  await expect(page.getByLabel('当前参与人')).toContainText('张三');
});

test('editor restores and deletes activities from the automatic draft box', async ({ page }) => {
  await page.goto('/editor.html', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('编辑器密码').fill('dinner');
  await page.getByRole('button', { name: '入席编辑' }).click();
  await page.getByLabel('活动名称').fill('草稿箱里的旧聚餐');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '新建聚餐' }).click();
  await page.getByLabel('活动名称').fill('正在编辑的新聚餐');
  const saveState = page.locator('.save-state');
  await expect(saveState).toContainText('保存中');
  await expect(saveState).toContainText('草稿已保存');
  await page.getByRole('button', { name: '草稿箱', exact: true }).click();

  const oldDraft = page.locator('.draft-card', { hasText: '草稿箱里的旧聚餐' });
  await expect(page.locator('.draft-card', { hasText: '正在编辑的新聚餐' })).toBeVisible();
  await expect(oldDraft).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await oldDraft.getByRole('button', { name: '恢复' }).click();
  await expect(page.getByLabel('活动名称')).toHaveValue('草稿箱里的旧聚餐');

  await page.getByRole('button', { name: '草稿箱', exact: true }).click();
  const newDraft = page.locator('.draft-card', { hasText: '正在编辑的新聚餐' });
  page.once('dialog', (dialog) => dialog.accept());
  await newDraft.getByRole('button', { name: '删除草稿 正在编辑的新聚餐' }).click();
  await expect(newDraft).toHaveCount(0);
});
