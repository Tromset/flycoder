(function() {
  var feedList = null;
  var sidebar = null;
  var userScrolled = false;
  var chatHistory = null;
  var chatInput = null;
  var chatSendBtn = null;
  var chatLoading = false;
  var chatSpeaker = 'fly';
  var speakerSelect = null;
  var thoughtBtn = null;
  var historyRequest = 0;
  var CHAT_API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';

  var iconMap = {
    place_food: 'F',
    clear_food: 'X',
    set_light: 'L',
    set_temp: 'T',
    touch: 'H',
    blow_wind: 'W'
  };

  function init() {
    feedList = document.getElementById('activity-feed-list');
    sidebar = document.getElementById('caretaker-sidebar');
    if (feedList === null) return;
    sidebar.classList.add('fly-chat-active');

    feedList.addEventListener('click', function(e) {
      var entry = e.target.closest('.activity-entry');
      if (entry) {
        var expanded = entry.getAttribute('data-expanded') === 'true';
        entry.setAttribute('data-expanded', expanded ? 'false' : 'true');
        if (expanded) {
          entry.classList.remove('expanded');
        } else {
          entry.classList.add('expanded');
        }
      }
    });

    feedList.addEventListener('scroll', function() {
      if (feedList.scrollTop > 20) {
        userScrolled = true;
      } else if (feedList.scrollTop <= 5) {
        userScrolled = false;
      }
    });

    chatHistory = document.getElementById('chat-history');
    chatInput = document.getElementById('chat-input');
    chatSendBtn = document.getElementById('chat-send-btn');
    speakerSelect = document.getElementById('chat-speaker');
    thoughtBtn = document.getElementById('fly-thought-btn');
    if (speakerSelect) speakerSelect.addEventListener('change', function() {
      chatSpeaker = speakerSelect.value;
      sidebar.classList.toggle('fly-chat-active', chatSpeaker === 'fly');
      chatInput.placeholder = chatSpeaker === 'fly' ? 'Comment te sens-tu ?' : 'Une question pour le gardien…';
      thoughtBtn.hidden = chatSpeaker !== 'fly';
      document.getElementById('fly-language-status').hidden = chatSpeaker !== 'fly';
      loadChatHistory();
    });
    if (thoughtBtn) thoughtBtn.addEventListener('click', function() { sendChatMessage('thought'); });

    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', function() { sendChatMessage('chat'); });
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage('chat');
        }
      });
    }

    loadChatHistory();
    updateLanguageStatus();
    setInterval(updateLanguageStatus, 15000);
  }

  function formatTime(isoString) {
    var d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getColorClass(kind, action, severity) {
    if (kind === 'incident' && severity === 'high') return 'incident';
    if (kind === 'incident') return 'warning';
    if (action === 'place_food' || action === 'clear_food') return 'feed';
    if (action === 'set_light' || action === 'set_temp') return 'comfort';
    return 'neutral';
  }

  function getIcon(kind, action) {
    if (kind === 'incident') return '!';
    return iconMap[action] || '*';
  }

  function buildDescription(kind, action, params, reasoning) {
    if (kind === 'incident') return reasoning;
    var p;
    try {
      p = typeof params === 'string' ? JSON.parse(params) : (params || {});
    } catch (e) {
      return action;
    }
    switch (action) {
      case 'place_food':
        return 'Placed food at (' + Math.round(p.x) + ', ' + Math.round(p.y) + ')';
      case 'clear_food':
        return 'Cleared all food';
      case 'set_light':
        return 'Set light to ' + (p.level || 'unknown');
      case 'set_temp':
        return 'Set temp to ' + (p.level || 'unknown');
      case 'touch':
        return 'Touched fly at (' + Math.round(p.x || 0) + ', ' + Math.round(p.y || 0) + ')';
      case 'blow_wind':
        return 'Blew wind (strength ' + (p.strength || 0.5).toFixed(1) + ')';
      default:
        return action;
    }
  }

  function createEntryEl(kind, action, params, reasoning, severity, timestamp) {
    var colorClass = getColorClass(kind, action, severity);
    var icon = getIcon(kind, action);
    var desc = buildDescription(kind, action, params, reasoning);
    var time = formatTime(timestamp);
    var el = document.createElement('div');
    el.className = 'activity-entry activity-' + colorClass;
    el.setAttribute('data-expanded', 'false');
    var reasoningText = kind === 'incident' ? '' : (reasoning || '');
    el.innerHTML =
      '<div class="activity-entry-header">' +
        '<span class="activity-icon">' + icon + '</span>' +
        '<span class="activity-time">' + time + '</span>' +
        '<span class="activity-desc">' + desc + '</span>' +
      '</div>' +
      (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '');
    return el;
  }

  function addEntry(kind, action, params, reasoning, severity, timestamp) {
    if (feedList === null) return;
    var el = createEntryEl(kind, action, params, reasoning, severity, timestamp);
    feedList.insertBefore(el, feedList.firstChild);
    if (feedList.children.length > 200) {
      feedList.removeChild(feedList.lastChild);
    }
    if (!userScrolled) {
      feedList.scrollTop = 0;
    }
  }

  function onAction(msg) {
    addEntry('action', msg.action, msg.params, msg.reasoning, null, msg.timestamp);
  }

  function onIncident(msg) {
    addEntry('incident', msg.incidentType, null, msg.description, msg.severity, msg.timestamp);
  }

  function onHistory(msg) {
    if (feedList === null) return;
    feedList.innerHTML = '';
    for (var i = 0; i < msg.entries.length; i++) {
      var e = msg.entries[i];
      var el;
      if (e.kind === 'action') {
        el = createEntryEl('action', e.name, e.params, e.reasoning, null, e.timestamp);
      } else if (e.kind === 'incident') {
        el = createEntryEl('incident', e.name, null, e.reasoning, null, e.timestamp);
      }
      if (el) feedList.appendChild(el);
    }
    feedList.scrollTop = 0;
  }

  function toggle() {
    if (sidebar === null) return false;
    sidebar.classList.toggle('sidebar-open');
    return sidebar.classList.contains('sidebar-open');
  }

  function isOpen() {
    return sidebar !== null && sidebar.classList.contains('sidebar-open');
  }

  function formatChatTime(isoString) {
    var d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function appendChatMessage(role, message, timestamp, isError) {
    if (chatHistory === null) return;
    var el = document.createElement('div');
    el.className = 'chat-msg chat-msg-' + (isError ? 'error' : role);
    el.innerHTML = '<div class="chat-msg-time">' + (role === 'user' ? 'Vous' : (chatSpeaker === 'fly' ? 'La mouche' : 'Claude')) + ' -- ' + formatChatTime(timestamp) + '</div>' + '<div>' + escapeHtml(message) + '</div>';
    chatHistory.appendChild(el);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function sendChatMessage(mode) {
    if (chatInput === null || chatLoading === true) return;
    var msg = mode === 'thought' ? 'À quoi penses-tu en ce moment ?' : chatInput.value.trim();
    if (msg === '') return;
    if (mode !== 'thought') chatInput.value = '';
    historyRequest++;
    appendChatMessage('user', msg, new Date().toISOString(), false);
    chatLoading = true;
    chatSendBtn.disabled = true;
    if (speakerSelect) speakerSelect.disabled = true;
    if (thoughtBtn) thoughtBtn.disabled = true;
    var loadingEl = document.createElement('div');
    loadingEl.className = 'chat-loading';
    loadingEl.textContent = chatSpeaker === 'fly' ? 'La mouche prépare sa réponse' : 'Réflexion';
    chatHistory.appendChild(loadingEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    var sessionId = window.caretakerBridge ? window.caretakerBridge.getSessionId() : null;
    var body = JSON.stringify({ message: msg, context: null, sessionId: sessionId });
    var endpoint = chatSpeaker === 'fly' ? '/fly/' + (mode === 'thought' ? 'thought' : 'chat') : '/chat';
    fetch(CHAT_API_URL + endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, signal: AbortSignal.timeout(65000) })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        if (data.error) {
          appendChatMessage('assistant', typeof data.error === 'string' ? data.error : data.message, new Date().toISOString(), true);
        } else {
          appendChatMessage('assistant', data.message, data.timestamp, false);
        }
        chatLoading = false;
        chatSendBtn.disabled = false;
        if (speakerSelect) speakerSelect.disabled = false;
        if (thoughtBtn) thoughtBtn.disabled = false;
        chatInput.focus();
      })
      .catch(function(err) {
        if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        appendChatMessage('assistant', 'Connection error: ' + err.message, new Date().toISOString(), true);
        chatLoading = false;
        chatSendBtn.disabled = false;
        if (speakerSelect) speakerSelect.disabled = false;
        if (thoughtBtn) thoughtBtn.disabled = false;
      });
  }

  function loadChatHistory() {
    if (chatHistory === null) return;
    var request = ++historyRequest;
    chatHistory.innerHTML = '';
    fetch(CHAT_API_URL + (chatSpeaker === 'fly' ? '/fly/history' : '/chat/history'))
      .then(function(res) { return res.json(); })
      .then(function(messages) {
        if (request !== historyRequest || !Array.isArray(messages)) return;
        chatHistory.innerHTML = '';
        for (var i = 0; i < messages.length; i++) {
          appendChatMessage(messages[i].role, messages[i].message, messages[i].timestamp, false);
        }
      })
      .catch(function(err) {
        console.warn('[chat] Failed to load history:', err.message);
      });
  }

  function updateLanguageStatus() {
    if (document.hidden) return;
    var statusEl = document.getElementById('fly-language-status');
    if (!statusEl) return;
    var sessionId = window.caretakerBridge ? window.caretakerBridge.getSessionId() : '';
    fetch(CHAT_API_URL + '/fly/status?sessionId=' + encodeURIComponent(sessionId), { signal: AbortSignal.timeout(4000) })
      .then(function(res) { if (!res.ok) throw new Error('status'); return res.json(); })
      .then(function(data) {
        var training = data.training || {};
        if (data.ready) statusEl.textContent = data.stateAvailable ? 'Qwen 2.5 prêt · Voix fondée sur l’état simulé.' : 'Qwen 2.5 prêt · En attente de la simulation.';
        else if (training.status === 'training') statusEl.textContent = 'Apprentissage de la voix · ' + training.iteration + ' / ' + training.iterations + ' étapes';
        else if (training.status === 'evaluating') statusEl.textContent = 'Évaluation des réponses avant activation…';
        else if (training.status === 'loading' || training.status === 'baseline') statusEl.textContent = 'Préparation de l’apprentissage…';
        else if (training.status === 'failed' || training.status === 'validation_failed') statusEl.textContent = 'L’apprentissage nécessite une intervention. Consulte le journal de session.';
        else statusEl.textContent = 'La voix Qwen est hors ligne.';
      })
      .catch(function() { statusEl.textContent = 'Serveur de conversation hors ligne.'; });
  }

  init();

  window.CaretakerSidebar = {
    init: init,
    onAction: onAction,
    onIncident: onIncident,
    onHistory: onHistory,
    toggle: toggle,
    isOpen: isOpen,
    loadChatHistory: loadChatHistory
  };
})();
