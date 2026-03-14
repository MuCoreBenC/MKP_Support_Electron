(function() {
  const MODE_LABELS = {
    '1': '最小热更新',
    '2': '标准热更新',
    '3': '完整热更新',
    '4': '全量安装包'
  };

  const state = {
    loaded: false,
    previewMode: 'edit',
    editorExpanded: false,
    currentInfo: null,
    lastSummary: '',
    selectedMode: '2'
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatInlineMarkdown(text) {
    let safe = escapeHtml(text);
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    safe = safe.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    return safe;
  }

  function renderMarkdown(markdown) {
    const lines = String(markdown || '').replace(/\r/g, '').split('\n');
    const html = [];
    let inCodeBlock = false;
    let codeLines = [];
    let listType = null;

    const closeList = () => {
      if (!listType) return;
      html.push(listType === 'ol' ? '</ol>' : '</ul>');
      listType = null;
    };

    const flushCodeBlock = () => {
      if (!codeLines.length) return;
      html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      if (trimmed.startsWith('```')) {
        closeList();
        if (inCodeBlock) flushCodeBlock();
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      if (!trimmed) {
        closeList();
        html.push('<div class="markdown-spacer"></div>');
        continue;
      }

      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        closeList();
        const level = Math.min(6, headingMatch[1].length);
        html.push(`<h${level}>${formatInlineMarkdown(headingMatch[2])}</h${level}>`);
        continue;
      }

      const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
      if (bulletMatch) {
        if (listType !== 'ul') {
          closeList();
          listType = 'ul';
          html.push('<ul>');
        }
        html.push(`<li>${formatInlineMarkdown(bulletMatch[1])}</li>`);
        continue;
      }

      const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      if (orderedMatch) {
        if (listType !== 'ol') {
          closeList();
          listType = 'ol';
          html.push('<ol>');
        }
        html.push(`<li>${formatInlineMarkdown(orderedMatch[1])}</li>`);
        continue;
      }

      const quoteMatch = trimmed.match(/^>\s+(.+)$/);
      if (quoteMatch) {
        closeList();
        html.push(`<blockquote>${formatInlineMarkdown(quoteMatch[1])}</blockquote>`);
        continue;
      }

      closeList();
      html.push(`<p>${formatInlineMarkdown(trimmed)}</p>`);
    }

    closeList();
    if (inCodeBlock) flushCodeBlock();
    return html.join('');
  }

  function setStatus(text, type) {
    const pill = $('releaseStatusPill');
    if (!pill) return;

    const palette = {
      idle: 'bg-gray-100 text-gray-500',
      success: 'bg-emerald-50 text-emerald-600',
      warning: 'bg-amber-50 text-amber-700',
      error: 'bg-rose-50 text-rose-600'
    };

    pill.className = `rounded-full px-4 py-2 text-xs font-medium ${palette[type] || palette.idle}`;
    pill.textContent = text;
  }

  function setBuildBadge(text, type) {
    const badge = $('releaseBuildBadge');
    if (!badge) return;

    const palette = {
      idle: 'bg-gray-100 text-gray-500',
      running: 'bg-blue-50 text-blue-600',
      success: 'bg-emerald-50 text-emerald-600',
      error: 'bg-rose-50 text-rose-600'
    };

    badge.className = `rounded-full px-3 py-1 text-[11px] font-medium ${palette[type] || palette.idle}`;
    badge.textContent = text;
  }

  function appendConsole(message) {
    const output = $('releaseConsoleOutput');
    if (!output) return;
    const stamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    output.textContent += `[${stamp}] ${message}\n`;
    output.scrollTop = output.scrollHeight;
  }

  function renderPathsInfo(info) {
    const container = $('releasePathsInfo');
    if (!container || !info?.paths) return;

    const rows = [
      ['项目目录', info.paths.projectRoot],
      ['云端数据目录', info.paths.cloudDataDir],
      ['上传输出目录', info.paths.uploadCloudDataDir],
      ['当前下载地址', info.downloadUrl]
    ];

    container.innerHTML = rows.map(([label, value]) => `
      <div class="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div class="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">${escapeHtml(label)}</div>
        <div class="mt-2 break-all font-mono text-[12px] text-gray-600">${escapeHtml(value || '--')}</div>
      </div>
    `).join('');
  }

  function fillForm(info) {
    $('releaseVersionInput').value = info.version || '';
    $('releaseDateInput').value = info.releaseDate || new Date().toISOString().slice(0, 10);
    $('releaseShortDescInput').value = info.shortDesc || '';
    $('releaseForceUpdateInput').checked = !!info.forceUpdate;
    $('releaseCanRollbackInput').checked = info.canRollback !== false;
    $('releaseNotesInput').value = info.releaseNotesMarkdown || '';
    renderPreview();
    renderPathsInfo(info);
  }

  function collectFormPayload() {
    return {
      version: $('releaseVersionInput').value.trim(),
      releaseDate: $('releaseDateInput').value,
      shortDesc: $('releaseShortDescInput').value.trim(),
      forceUpdate: $('releaseForceUpdateInput').checked,
      canRollback: $('releaseCanRollbackInput').checked,
      releaseNotesMarkdown: $('releaseNotesInput').value
    };
  }

  function setPreviewMode(mode) {
    state.previewMode = mode === 'preview' ? 'preview' : 'edit';
    $('btnMarkdownEditMode').classList.toggle('active', state.previewMode === 'edit');
    $('btnMarkdownPreviewMode').classList.toggle('active', state.previewMode === 'preview');
    $('releaseNotesInput').classList.toggle('hidden', state.previewMode !== 'edit');
    $('releaseMarkdownPreview').classList.toggle('hidden', state.previewMode !== 'preview');
  }

  function setEditorExpanded(expanded) {
    state.editorExpanded = !!expanded;
    $('releaseEditorCard').classList.toggle('is-expanded', state.editorExpanded);
    $('releaseEditorSurface').classList.toggle('is-expanded', state.editorExpanded);
    $('releaseNotesInput').classList.toggle('is-expanded', state.editorExpanded);
    $('releaseMarkdownPreview').classList.toggle('is-expanded', state.editorExpanded);
    $('btnToggleEditorSize').textContent = state.editorExpanded ? '收起编辑区' : '展开编辑区';
  }

  function renderPreview() {
    const preview = $('releaseMarkdownPreview');
    const input = $('releaseNotesInput');
    if (!preview || !input) return;

    const html = renderMarkdown(input.value);
    preview.innerHTML = html || '<p>暂无内容</p>';
  }

  function updateSelectedModeUI() {
    document.querySelectorAll('.release-mode-btn').forEach((button) => {
      const isSelected = button.dataset.releaseMode === state.selectedMode;
      button.classList.toggle('selected', isSelected);
      const check = button.querySelector('.release-mode-check');
      if (check) {
        check.classList.toggle('is-selected', isSelected);
      }
    });
    $('selectedReleaseModeLabel').textContent = `已选择: ${MODE_LABELS[state.selectedMode] || state.selectedMode}`;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }

  async function openReleasePath(target) {
    const result = await window.mkpAPI.openReleasePath(target);
    if (!result?.success) {
      throw new Error(result?.error || '打开路径失败');
    }
    appendConsole(`已打开 ${result.path}`);
  }

  async function loadReleaseInfo() {
    setStatus('正在读取发版信息...', 'idle');
    const result = await window.mkpAPI.readReleaseInfo();
    if (!result?.success) {
      setStatus(`读取失败: ${result?.error || '未知错误'}`, 'error');
      appendConsole(`读取发版信息失败: ${result?.error || '未知错误'}`);
      return;
    }

    state.currentInfo = result.data;
    fillForm(result.data);
    setStatus(`已读取当前版本 v${result.data.version}`, 'success');
    appendConsole(`已加载当前发版信息: v${result.data.version}`);
  }

  async function saveReleaseInfo(options = {}) {
    const payload = collectFormPayload();
    setStatus('正在保存发版信息...', 'idle');

    const result = await window.mkpAPI.saveReleaseInfo(payload);
    if (!result?.success) {
      setStatus(`保存失败: ${result?.error || '未知错误'}`, 'error');
      appendConsole(`保存失败: ${result?.error || '未知错误'}`);
      if (!options.quiet) {
        window.alert(result?.error || '保存失败');
      }
      return null;
    }

    state.currentInfo = {
      ...(state.currentInfo || {}),
      ...payload,
      ...result.data,
      paths: state.currentInfo?.paths || {}
    };
    renderPathsInfo(state.currentInfo);
    setStatus(`已保存 v${result.data.version}`, 'success');
    appendConsole(`发版信息已保存，当前版本: v${result.data.version}`);
    return result.data;
  }

  async function runBuild(mode) {
    const modeLabel = MODE_LABELS[String(mode)] || String(mode);
    const saveResult = await saveReleaseInfo({ quiet: true });
    if (!saveResult) return;

    setBuildBadge(`执行中: ${modeLabel}`, 'running');
    appendConsole(`开始执行 ${modeLabel}...`);

    document.querySelectorAll('.release-mode-btn, #btnSaveReleaseInfo, #btnRunSelectedMode, #btnToggleEditorSize').forEach((element) => {
      element.disabled = true;
      element.classList.add('opacity-70', 'cursor-not-allowed');
    });

    try {
      const result = await window.mkpAPI.runReleaseBuild(String(mode));
      if (!result?.success) {
        throw new Error(result?.error || '打包失败');
      }

      const data = result.data || {};
      const summaryLines = [
        `模式: ${modeLabel}`,
        data.version ? `版本: v${data.version}` : '',
        data.patchPath ? `补丁: ${data.patchPath}` : '',
        data.uploadCloudDataDir ? `上传目录: ${data.uploadCloudDataDir}` : '',
        data.distDir ? `安装包目录: ${data.distDir}` : '',
        Number.isFinite(data.changedCount) ? `包含文件: ${data.changedCount}` : ''
      ].filter(Boolean);

      state.lastSummary = summaryLines.join('\n');
      summaryLines.forEach((line) => appendConsole(line));
      setBuildBadge(`${modeLabel}完成`, 'success');
      setStatus(`${modeLabel}已完成`, 'success');
    } catch (error) {
      setBuildBadge(`${modeLabel}失败`, 'error');
      setStatus(`${modeLabel}失败`, 'error');
      appendConsole(`执行失败: ${error.message}`);
      window.alert(error.message);
    } finally {
      document.querySelectorAll('.release-mode-btn, #btnSaveReleaseInfo, #btnRunSelectedMode, #btnToggleEditorSize').forEach((element) => {
        element.disabled = false;
        element.classList.remove('opacity-70', 'cursor-not-allowed');
      });
    }
  }

  function bindEvents() {
    $('btnReloadReleaseInfo').addEventListener('click', () => {
      loadReleaseInfo();
    });

    $('btnOpenManifest').addEventListener('click', async () => {
      try {
        await openReleasePath('manifest');
      } catch (error) {
        window.alert(error.message);
      }
    });

    $('btnMarkdownEditMode').addEventListener('click', () => {
      setPreviewMode('edit');
    });

    $('btnMarkdownPreviewMode').addEventListener('click', () => {
      renderPreview();
      setPreviewMode('preview');
    });

    $('btnToggleEditorSize').addEventListener('click', () => {
      setEditorExpanded(!state.editorExpanded);
    });

    $('releaseNotesInput').addEventListener('input', () => {
      if (state.previewMode === 'preview') {
        renderPreview();
      }
    });

    $('btnSaveReleaseInfo').addEventListener('click', async () => {
      await saveReleaseInfo();
    });

    $('btnRunSelectedMode').addEventListener('click', async () => {
      await runBuild(state.selectedMode);
    });

    document.querySelectorAll('.release-mode-btn').forEach((button) => {
      button.addEventListener('click', () => {
        state.selectedMode = button.dataset.releaseMode || '2';
        updateSelectedModeUI();
      });
    });

    $('btnOpenCloudOutput').addEventListener('click', async () => {
      try {
        await openReleasePath('cloud');
      } catch (error) {
        window.alert(error.message);
      }
    });

    $('btnOpenDistOutput').addEventListener('click', async () => {
      try {
        await openReleasePath('dist');
      } catch (error) {
        window.alert(error.message);
      }
    });

    $('btnOpenReleaseReadme').addEventListener('click', async () => {
      try {
        await openReleasePath('readme');
      } catch (error) {
        window.alert(error.message);
      }
    });

    $('btnCopyReleaseSummary').addEventListener('click', async () => {
      try {
        if (!state.lastSummary) {
          throw new Error('当前还没有可复制的打包结果。');
        }
        await copyText(state.lastSummary);
        appendConsole('已复制结果摘要到剪贴板');
      } catch (error) {
        window.alert(error.message);
      }
    });

    document.addEventListener('keydown', async (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        await saveReleaseInfo();
      }
    });
  }

  async function init() {
    if (state.loaded) return;
    state.loaded = true;
    setPreviewMode('edit');
    setEditorExpanded(false);
    updateSelectedModeUI();
    bindEvents();
    renderPreview();
    await loadReleaseInfo();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
