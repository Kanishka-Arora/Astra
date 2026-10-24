/* ==========================================================================
   ASTRA - Women Safety & Emergency Defense Network
   Client-Side Engine (SOS, Audio Siren, Geolocation, Contacts)
   ========================================================================== */

(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // Global State
    // -----------------------------------------------------------------------
    let audioCtx        = null;
    let sirenOscillator = null;
    let sirenGainNode   = null;
    let sirenInterval   = null;
    let isAlarmPlaying  = false;
    let userCoordinates = null;  // Populated once GPS resolves
    let _cachedContacts = [];    // Contacts from backend API

    // -----------------------------------------------------------------------
    // Boot on DOM ready
    // -----------------------------------------------------------------------
    document.addEventListener('DOMContentLoaded', () => {
        initNavToggle();
        setupSOSButtonListeners();
        setupAlarmButtonListeners();
        setupLocationButtonListeners();
        initScenarioAccordions();
        // Preload contacts from backend so SOS modal has data immediately
        fetchContactsFromAPI(() => {
            renderContactsTable();
        });
    });

    // -----------------------------------------------------------------------
    // Navigation – Mobile Hamburger Toggle
    // -----------------------------------------------------------------------
    function initNavToggle() {
        const toggle = document.getElementById('navToggle');
        const links  = document.getElementById('navLinks');
        if (toggle && links) {
            toggle.addEventListener('click', () => links.classList.toggle('show'));
        }
    }

    // -----------------------------------------------------------------------
    // SOS – Emergency Broadcast System
    // -----------------------------------------------------------------------
    function setupSOSButtonListeners() {
        // Attach to all SOS-trigger elements
        document.querySelectorAll('.sos-trigger-btn, .btn-nav-sos, #sosButton').forEach(btn => {
            btn.addEventListener('click', e => { e.preventDefault(); triggerSOS(); });
        });

        // Close button
        const closeBtn = document.getElementById('closeSosModalBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeSOSModal);

        // Click outside modal
        const overlay = document.getElementById('sosModalOverlay');
        if (overlay) {
            overlay.addEventListener('click', e => { if (e.target === overlay) closeSOSModal(); });
        }
    }

    /**
     * triggerSOS()
     * ─ Opens modal IMMEDIATELY (no waiting for GPS).
     * ─ Broadcasts to backend right away.
     * ─ GPS runs in parallel; when it resolves the modal updates.
     */
    window.triggerSOS = function () {
        const modal = document.getElementById('sosModalOverlay');
        if (!modal) return;

        // 1. Open modal instantly
        modal.classList.add('active');
        document.body.classList.add('sos-active');

        // 2. Fire the siren immediately at peak volume
        if (!isAlarmPlaying) {
            window.startSafetyAlarm();
        }

        // 2. Show spinner placeholders
        const locInfo  = document.getElementById('sosLocationPreview');
        const contBox  = document.getElementById('sosContactsAlerted');

        if (locInfo) {
            locInfo.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;color:#B8B8B8;">
                    <span class="sos-spinner"></span> Acquiring GPS satellite lock…
                </div>`;
        }
        if (contBox) {
            contBox.innerHTML = `<em style="color:var(--text-muted);">Dispatching emergency alerts…</em>`;
        }

        // 3. Fire backend broadcast NOW (with whatever coords we have)
        broadcastSOS(userCoordinates, contBox);

        // 4. Request GPS in parallel — update modal when it comes in
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                pos => {
                    userCoordinates = {
                        latitude:  pos.coords.latitude,
                        longitude: pos.coords.longitude,
                        accuracy:  pos.coords.accuracy
                    };
                    renderSOSLocation(locInfo, userCoordinates);
                    // Re-broadcast with real coords (updates the server log)
                    broadcastSOS(userCoordinates, contBox);
                },
                err => {
                    if (locInfo) {
                        locInfo.innerHTML = `
                            <span style="color:#FF1A1A;">
                                GPS unavailable${err.code === 1 ? ' — location permission denied' : ''}.<br>
                                SOS broadcast sent without coordinates.
                            </span>`;
                    }
                },
                { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
            );
        } else {
            if (locInfo) {
                locInfo.innerHTML = `<span style="color:#FF1A1A;">Geolocation not supported by browser. SOS sent.</span>`;
            }
        }
    };

    /** Renders locked GPS coords + Maps link into the modal panel */
    function renderSOSLocation(panel, coords) {
        if (!panel || !coords) return;
        const mapsUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
        panel.innerHTML = `
            <p style="color:#FF1A1A;font-weight:700;margin-bottom:6px;font-size:0.82rem;letter-spacing:1px;">GPS LOCKED</p>
            <p style="font-family:monospace;color:#fff;margin-bottom:6px;">
                Lat: ${coords.latitude.toFixed(6)}&nbsp;&nbsp;|&nbsp;&nbsp;Lng: ${coords.longitude.toFixed(6)}
            </p>
            <p style="font-size:0.78rem;color:#B8B8B8;margin-bottom:8px;">
                Accuracy: ±${Math.round(coords.accuracy || 0)} m
            </p>
            <a href="${mapsUrl}" target="_blank" rel="noopener"
               style="color:#D60000;font-size:0.85rem;text-decoration:underline;">
                Open Live Location in Google Maps ↗
            </a>`;
    }

    /**
     * Calls /api/sos-broadcast and renders the contact dispatch list.
     * coords: null | {latitude, longitude}
     */
    function broadcastSOS(coords, contBox) {
        const coordsPayload = (coords && coords.latitude)
            ? { latitude: coords.latitude, longitude: coords.longitude }
            : 'Unknown';

        const mapsUrl = (coords && coords.latitude)
            ? `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`
            : null;

        fetch('/api/sos-broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                coords: coordsPayload
            })
        })
        .then(r => r.json())
        .then(data => {
            renderAlertedContacts(contBox, data.contacts || [], mapsUrl);
        })
        .catch(() => {
            // Offline fallback — use cached contacts
            renderAlertedContacts(contBox, _cachedContacts, mapsUrl);
        });
    }

    /**
     * Renders the alerted contacts list in the SOS modal.
     * Each row has WhatsApp and SMS action links.
     */
    function renderAlertedContacts(box, contacts, mapsUrl) {
        if (!box) return;

        if (!contacts || contacts.length === 0) {
            box.innerHTML = `
                <div style="color:#B8B8B8;font-size:0.9rem;padding:8px 0;">
                    No emergency contacts configured.
                    <a href="/contacts" style="color:#FF1A1A;font-weight:600;">Add contacts now →</a>
                </div>`;
            return;
        }

        const locText  = mapsUrl
            ? `EMERGENCY ALERT from ASTRA: I need help! My live location: ${mapsUrl}`
            : 'EMERGENCY ALERT from ASTRA: I need help! Location tracking activated.';

        const encoded  = encodeURIComponent(locText);

        box.innerHTML = contacts.map(c => {
            const phone    = (c.phone || '').replace(/[\s\-()]/g, '');
            const waLink   = phone ? `https://wa.me/${phone.replace(/^\+/, '')}?text=${encoded}` : '#';
            const smsLink  = phone ? `sms:${phone}?body=${encoded}` : '#';

            return `
            <div style="
                display:flex; justify-content:space-between; align-items:center;
                padding:10px 0; border-bottom:1px solid rgba(214,0,0,0.15);
                flex-wrap:wrap; gap:8px;">
                <div style="flex:1; min-width:120px;">
                    <div style="color:#fff;font-weight:700;font-size:0.95rem;">${escapeHTML(c.name)}</div>
                    <div style="color:var(--text-muted);font-size:0.78rem;">
                        ${escapeHTML(c.relation || 'Contact')} &bull; ${escapeHTML(c.phone || '')}
                    </div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;">
                    <a href="${waLink}" target="_blank" rel="noopener"
                       style="background:#25D366;color:#fff;padding:5px 11px;border-radius:6px;
                              font-size:0.78rem;font-weight:700;text-decoration:none;white-space:nowrap;">
                        WhatsApp
                    </a>
                    <a href="${smsLink}"
                       style="background:rgba(255,26,26,0.2);border:1px solid var(--red-glow);
                              color:#fff;padding:5px 11px;border-radius:6px;
                              font-size:0.78rem;font-weight:700;text-decoration:none;white-space:nowrap;">
                        SMS
                    </a>
                </div>
            </div>`;
        }).join('');
    }

    window.closeSOSModal = function () {
        const modal = document.getElementById('sosModalOverlay');
        if (modal) modal.classList.remove('active');
        document.body.classList.remove('sos-active');
        // Stop the siren when user stands down
        window.stopSafetyAlarm();
    };

    // -----------------------------------------------------------------------
    // Acoustic Safety Siren  (Web Audio API)
    // -----------------------------------------------------------------------
    function setupAlarmButtonListeners() {
        // NOTE: Alarm buttons use onclick="window.toggleSafetyAlarm()" inline.
        // We only handle the dedicated stopAlarmBtn if it exists (separate stop button).
        const stopBtn = document.getElementById('stopAlarmBtn');
        if (stopBtn) stopBtn.addEventListener('click', window.stopSafetyAlarm);
    }

    window.toggleSafetyAlarm = function () {
        if (isAlarmPlaying) {
            window.stopSafetyAlarm();
        } else {
            window.startSafetyAlarm();
        }
    };

    window.startSafetyAlarm = function () {
        // Guard: don't start twice
        if (isAlarmPlaying) return;

        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) { alert('Your browser does not support Web Audio. Try Chrome or Firefox.'); return; }
            if (!audioCtx) audioCtx = new AC();
            if (audioCtx.state === 'suspended') audioCtx.resume();

            // --- Primary oscillator (sawtooth — harsh, cutting) ---
            sirenOscillator = audioCtx.createOscillator();
            sirenOscillator.type = 'sawtooth';
            sirenOscillator.frequency.setValueAtTime(880, audioCtx.currentTime);

            // --- Second oscillator for richness ---
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(440, audioCtx.currentTime);

            // --- Gain ---
            sirenGainNode = audioCtx.createGain();
            sirenGainNode.gain.setValueAtTime(0.0, audioCtx.currentTime);
            sirenGainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.1);

            const gain2 = audioCtx.createGain();
            gain2.gain.setValueAtTime(0.15, audioCtx.currentTime);

            sirenOscillator.connect(sirenGainNode);
            osc2.connect(gain2);
            gain2.connect(sirenGainNode);
            sirenGainNode.connect(audioCtx.destination);

            sirenOscillator.start();
            osc2.start();

            // Store osc2 reference for cleanup
            sirenOscillator._osc2     = osc2;
            sirenOscillator._gain2    = gain2;

            // Sweep frequencies up and down for siren wail effect
            let phase = 0;
            sirenInterval = setInterval(() => {
                if (!audioCtx || !sirenOscillator) return;
                phase++;
                // Alternate between low and high pitch every 350ms
                const freq1 = phase % 2 === 0 ? 960 : 640;
                const freq2 = phase % 2 === 0 ? 480 : 320;
                sirenOscillator.frequency.setTargetAtTime(freq1, audioCtx.currentTime, 0.06);
                if (sirenOscillator._osc2) {
                    sirenOscillator._osc2.frequency.setTargetAtTime(freq2, audioCtx.currentTime, 0.06);
                }
            }, 350);

            isAlarmPlaying = true;
            document.body.classList.add('alarm-active-border');
            updateAlarmUI(true);

        } catch (err) {
            console.error('Alarm start error:', err);
            alert('Audio playback error: ' + err.message + '\nEnsure your browser allows audio and the page is focused.');
        }
    };

    window.stopSafetyAlarm = function () {
        if (!isAlarmPlaying && !sirenOscillator) return;
        if (sirenInterval) { clearInterval(sirenInterval); sirenInterval = null; }
        if (sirenOscillator) {
            try {
                if (sirenOscillator._osc2)  { sirenOscillator._osc2.stop();  sirenOscillator._osc2.disconnect(); }
                if (sirenOscillator._gain2) { sirenOscillator._gain2.disconnect(); }
                sirenOscillator.stop();
                sirenOscillator.disconnect();
            } catch (_) {}
            sirenOscillator = null;
        }
        if (sirenGainNode) { try { sirenGainNode.disconnect(); } catch (_) {} sirenGainNode = null; }
        isAlarmPlaying = false;
        document.body.classList.remove('alarm-active-border');
        updateAlarmUI(false);
    };

    function updateAlarmUI(active) {
        // Update every alarm button on the page (dashboard + index card)
        document.querySelectorAll('#alarmButton').forEach(btn => {
            btn.textContent = active ? 'STOP ALARM' : 'START ALARM';
            btn.classList.toggle('btn-primary', !active);
            btn.classList.toggle('btn-danger',   active);
        });

        const pill = document.getElementById('alarmStatusPill');
        if (pill) {
            pill.textContent = active ? 'SIREN ACTIVE' : 'STANDBY';
            pill.className   = 'alarm-status-pill ' + (active ? 'active' : 'inactive');
        }
    }

    // -----------------------------------------------------------------------
    // Geolocation – Live GPS Panel
    // -----------------------------------------------------------------------
    function setupLocationButtonListeners() {
        document.querySelectorAll('#getLocationBtn, [onclick="getLocation()"]').forEach(btn => {
            btn.onclick = null;
            btn.addEventListener('click', e => { e.preventDefault(); fetchLocation(renderLocationResult); });
        });
    }

    window.getLocation = function () { fetchLocation(renderLocationResult); };

    function fetchLocation(callback) {
        const panel = document.getElementById('location');
        if (panel) panel.innerHTML = '<em>Acquiring GPS signal…</em>';

        if (!navigator.geolocation) {
            if (panel) panel.innerHTML = '<span style="color:#FF1A1A;">Geolocation not supported.</span>';
            if (callback) callback(null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => {
                userCoordinates = {
                    latitude:  pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracy:  pos.coords.accuracy
                };
                if (callback) callback(userCoordinates);
            },
            err => {
                const msg = err.code === err.PERMISSION_DENIED
                    ? 'Location permission denied — please allow in browser settings.'
                    : 'Unable to retrieve location.';
                if (panel) panel.innerHTML = `<span style="color:#FF1A1A;">${msg}</span>`;
                if (callback) callback(null);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    function renderLocationResult(coords) {
        const panel       = document.getElementById('location');
        const actionPanel = document.getElementById('locationActionPanel');
        if (!panel || !coords) return;

        const mapsUrl = `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`;
        panel.innerHTML = `
            <div class="location-coords">LAT: ${coords.latitude.toFixed(6)} | LNG: ${coords.longitude.toFixed(6)}</div>
            <div style="font-size:0.82rem;color:#B8B8B8;margin-top:4px;">Accuracy ±${Math.round(coords.accuracy)} m</div>
        `;

        if (actionPanel) {
            actionPanel.innerHTML = `
                <a href="${mapsUrl}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Open Live Map</a>
                <button type="button" class="btn btn-secondary btn-sm" id="copyCoordsBtn">Copy Coordinates</button>
            `;
            const copyBtn = document.getElementById('copyCoordsBtn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    const text = `Emergency GPS: ${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)} (${mapsUrl})`;
                    navigator.clipboard.writeText(text).then(() => {
                        copyBtn.innerText = 'Copied!';
                        setTimeout(() => copyBtn.innerText = 'Copy Coordinates', 2500);
                    });
                });
            }
        }
    }

    // -----------------------------------------------------------------------
    // Emergency Contacts Manager  (Backend API)
    // -----------------------------------------------------------------------
    function fetchContactsFromAPI(callback) {
        fetch('/api/contacts')
            .then(r => r.json())
            .then(data => {
                _cachedContacts = data.contacts || [];
                if (callback) callback(_cachedContacts);
            })
            .catch(() => {
                if (callback) callback(_cachedContacts);
            });
    }

    function getStoredContacts() { return _cachedContacts; }

    // Exposed so contacts page's form can call after add/delete
    function initContactsManager() {
        fetchContactsFromAPI(() => renderContactsTable());

        const form = document.getElementById('addContactForm');
        if (!form) return;

        form.addEventListener('submit', e => {
            e.preventDefault();
            const name     = (document.getElementById('contactName')?.value     || '').trim();
            const phone    = (document.getElementById('contactPhone')?.value    || '').trim();
            const relation = (document.getElementById('contactRelation')?.value || 'Emergency Contact').trim();
            const email    = (document.getElementById('contactEmail')?.value    || '').trim();

            if (!name || !phone) { alert('Name and phone are required.'); return; }

            const btn = form.querySelector('button[type="submit"]');
            if (btn) { btn.disabled = true; btn.innerText = 'Adding…'; }

            fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, relation, email })
            })
            .then(r => r.json())
            .then(data => {
                if (btn) { btn.disabled = false; btn.innerText = 'Add Contact'; }
                if (data.status === 'success') {
                    form.reset();
                    showToast(`${name} added to your emergency circle!`);
                    fetchContactsFromAPI(() => renderContactsTable());
                } else {
                    alert(data.message || 'Failed to add contact.');
                }
            })
            .catch(() => {
                if (btn) { btn.disabled = false; btn.innerText = 'Add Contact'; }
                alert('Network error — please try again.');
            });
        });
    }

    // Make initContactsManager run on DOMContentLoaded (handles contacts page)
    document.addEventListener('DOMContentLoaded', initContactsManager);

    function renderContactsTable() {
        const tbody = document.getElementById('contactsTableBody');
        const badge = document.getElementById('contactsCountBadge');
        if (!tbody) return;

        const contacts = getStoredContacts();
        if (badge) badge.innerText = contacts.length;

        if (contacts.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center;color:var(--text-muted);padding:2.5rem 1rem;">
                        No emergency contacts yet.
                        Add a trusted person using the form above.
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = contacts.map(c => `
            <tr>
                <td style="font-weight:700;color:#fff;">${escapeHTML(c.name)}</td>
                <td><span class="badge-relation">${escapeHTML(c.relation || 'Contact')}</span></td>
                <td style="font-family:monospace;color:#B8B8B8;">
                    ${escapeHTML(c.phone)}
                    ${c.email ? `<br><span style="font-size:0.78rem;color:var(--text-muted);">${escapeHTML(c.email)}</span>` : ''}
                </td>
                <td style="text-align:right;white-space:nowrap;">
                    <button class="btn btn-secondary btn-sm"
                        onclick="window.testContactAlert(${c.id}, '${escapeHTML(c.name)}', '${escapeHTML(c.phone)}')">
                        Test Alert
                    </button>
                    <button class="btn btn-danger btn-sm" style="margin-left:6px;"
                        onclick="window.removeContact(${c.id})">
                        Remove
                    </button>
                </td>
            </tr>`).join('');
    }

    window.removeContact = function (id) {
        if (!confirm('Remove this contact from your emergency circle?')) return;
        fetch(`/api/contacts/${id}`, { method: 'DELETE' })
            .then(r => r.json())
            .then(data => {
                if (data.status === 'success') {
                    showToast('Contact removed.');
                    fetchContactsFromAPI(() => renderContactsTable());
                }
            })
            .catch(() => alert('Failed to remove contact.'));
    };

    window.testContactAlert = function (id, name, phone) {
        const cleanPhone = (phone || '').replace(/[\s\-()]/g, '');
        const msg        = encodeURIComponent(`[ASTRA TEST] This is a test emergency alert from your trusted contact. Your ASTRA account is configured and working.`);
        const waUrl      = cleanPhone ? `https://wa.me/${cleanPhone.replace(/^\+/, '')}?text=${msg}` : null;

        if (waUrl) {
            showToast(`Opening WhatsApp to send test alert to ${name}…`);
            setTimeout(() => window.open(waUrl, '_blank', 'noopener'), 800);
        } else {
            showToast(`Test alert prepared for ${name} (${phone}).`);
        }
    };

    // -----------------------------------------------------------------------
    // Safety Assistant – Accordion Panels
    // -----------------------------------------------------------------------
    function initScenarioAccordions() {
        document.querySelectorAll('.scenario-header').forEach(header => {
            header.addEventListener('click', () => {
                const body  = header.nextElementSibling;
                if (!body) return;
                const open  = body.style.display === 'block';
                body.style.display = open ? 'none' : 'block';
                const arrow = header.querySelector('.scenario-toggle-arrow');
                if (arrow) arrow.innerText = open ? '▼' : '▲';
            });
        });
    }

    // -----------------------------------------------------------------------
    // Utilities
    // -----------------------------------------------------------------------
    function escapeHTML(str) {
        return String(str || '')
            .replace(/&/g,  '&amp;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#039;');
    }

    function showToast(message) {
        const old = document.getElementById('astraToast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.id = 'astraToast';
        toast.style.cssText = `
            position:fixed; bottom:24px; right:24px; z-index:99999;
            background:linear-gradient(135deg, #0D0002, #3D0005);
            border:1px solid #FF1A1A;
            color:#fff; padding:14px 22px; border-radius:12px;
            box-shadow:0 10px 30px rgba(0,0,0,0.8), 0 0 20px rgba(255,26,26,0.35);
            font-size:0.92rem; font-weight:500;
            animation:fadeIn 0.3s ease;
            max-width: 340px;
        `;
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s ease';
            toast.style.opacity    = '0';
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }

    // Keep backward-compat alias
    window.showTemporaryToast = showToast;

})();
