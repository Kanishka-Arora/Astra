"""
=============================================================================
ASTRA - Women Safety & Emergency Defense Network
Python Flask Backend & SQLite Database Engine
=============================================================================
"""

import os
import sqlite3
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

# Initialize Flask Application
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE_DIR, 'static'), static_url_path='/static')
app.secret_key = os.environ.get('SECRET_KEY', 'astra-defense-secure-token-2026-key')
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'

# Database Path Configuration
# On Vercel, the only writable directory is /tmp (serverless filesystem is read-only)
if os.environ.get('VERCEL'):
    DATABASE = '/tmp/database.db'
else:
    DATABASE = os.path.join(BASE_DIR, 'database.db')



def login_required(f):
    """Decorator to enforce authenticated session for protected routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('user_id'):
            flash('Please log in to access your personal safety command center.', 'warning')
            return redirect(url_for('login', next=request.path))
        return f(*args, **kwargs)
    return decorated_function


def get_db():
    """Connect to the SQLite database and return connection with Row factory."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initialize database tables for users, incident reports, contacts, and SOS logs."""
    conn = get_db()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 2. Incident Reports Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            incident_type TEXT NOT NULL,
            date_time TEXT NOT NULL,
            location TEXT NOT NULL,
            urgency TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # 3. Emergency Contacts Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            relation TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    """)

    # 4. SOS Dispatch Telemetry Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sos_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            coords TEXT,
            timestamp TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Insert initial sample report if table is empty for rich display
    cursor.execute("SELECT COUNT(*) FROM reports")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO reports (user_id, incident_type, date_time, location, urgency, description)
            VALUES (
                NULL,
                'Suspicious Activity / Lurking',
                datetime('now', '-2 hours'),
                'Central Metro Station, East Exit',
                'Medium',
                'Observed an unidentified individual repeatedly pacing along the unlit stairs near the east exit. Diverted route to main concourse and alerted station security.'
            )
        """)

    # Ensure email column exists on contacts table
    cursor.execute("PRAGMA table_info(contacts)")
    contact_cols = [col[1] for col in cursor.fetchall()]
    if 'email' not in contact_cols:
        cursor.execute("ALTER TABLE contacts ADD COLUMN email TEXT")

    # Seed default demonstration user if not present
    cursor.execute("SELECT id FROM users WHERE LOWER(username) = 'demo'")
    demo_user = cursor.fetchone()
    if not demo_user:
        cursor.execute("""
            INSERT INTO users (username, email, password_hash)
            VALUES ('demo', 'demo@astra.safe', ?)
        """, (generate_password_hash('password123'),))
        demo_id = cursor.lastrowid
    else:
        demo_id = demo_user['id']

    # Seed initial emergency contacts for demo user if none exist
    cursor.execute("SELECT COUNT(*) FROM contacts WHERE user_id = ?", (demo_id,))
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO contacts (user_id, name, phone, relation, email)
            VALUES 
                (?, 'Sarah Miller (Sister)', '+1 (555) 234-5678', 'Family', 'sarah.m@example.com'),
                (?, 'Officer Davis (Campus Security)', '+1 (555) 888-2910', 'Guardian', 'security@campus.edu')
        """, (demo_id, demo_id))

    conn.commit()
    conn.close()


# Ensure database tables exist on startup
init_db()


# ---------------------------------------------------------------------------
# Routes: Core Pages
# ---------------------------------------------------------------------------

@app.route('/')
def index():
    """Landing Page with Hero, SOS Button, Feature Highlights, and Emergency Hotlines."""
    return render_template('index.html')


@app.route('/dashboard')
@login_required
def dashboard():
    """Unified Safety Command Center with real-time controls."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC", (user_id,))
    user_contacts = cursor.fetchall()
    conn.close()
    return render_template('dashboard.html', contacts=user_contacts)


@app.route('/contacts', methods=['GET', 'POST'])
@login_required
def contacts():
    """Emergency Contacts Management Page with direct SQLite database sync."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        phone = request.form.get('phone', '').strip()
        relation = request.form.get('relation', 'Emergency Contact').strip()
        email = request.form.get('email', '').strip()

        if not name or not phone:
            flash('Please enter both full name and emergency phone number.', 'error')
        else:
            cursor.execute("""
                INSERT INTO contacts (user_id, name, phone, relation, email)
                VALUES (?, ?, ?, ?, ?)
            """, (user_id, name, phone, relation, email))
            conn.commit()
            flash(f'Emergency contact "{name}" successfully registered to your defense circle!', 'success')
            conn.close()
            return redirect(url_for('contacts'))

    cursor.execute("SELECT * FROM contacts WHERE user_id = ? ORDER BY id DESC", (user_id,))
    user_contacts = cursor.fetchall()
    conn.close()
    return render_template('contacts.html', contacts=user_contacts)


@app.route('/assistant')
def assistant():
    """Interactive Situational Safety Assistant with Tactical Playbooks."""
    return render_template('assistant.html')


# ---------------------------------------------------------------------------
# Routes: Incident Reporting
# ---------------------------------------------------------------------------

@app.route('/report', methods=['GET', 'POST'])
@login_required
def report():
    """File a confidential incident report and view the current user's historical records."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        incident_type = request.form.get('incident_type', '').strip()
        date_time     = request.form.get('date_time', '').strip()
        location      = request.form.get('location', '').strip()
        urgency       = request.form.get('urgency', 'Medium').strip()
        description   = request.form.get('description', '').strip()

        if not incident_type or not location or not description:
            flash('Please fill in all required fields (Incident Type, Location, Description).', 'error')
        else:
            cursor.execute("""
                INSERT INTO reports (user_id, incident_type, date_time, location, urgency, description)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (user_id, incident_type, date_time, location, urgency, description))
            conn.commit()
            flash('Incident report successfully recorded to your secure personal log.', 'success')
            conn.close()
            return redirect(url_for('report'))

    # All reports are visible to every logged-in user; only owners can delete
    cursor.execute(
        "SELECT * FROM reports ORDER BY id DESC"
    )
    reports_list = cursor.fetchall()
    conn.close()

    return render_template('report.html', reports=reports_list, current_user_id=user_id)


@app.route('/report/delete/<int:report_id>', methods=['POST'])
@login_required
def delete_report(report_id):
    """Delete a specific incident report belonging to the logged-in user."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM reports WHERE id = ? AND user_id = ?",
        (report_id, user_id)
    )
    conn.commit()
    conn.close()
    flash('Incident report deleted from your secure log.', 'info')
    return redirect(url_for('report'))


@app.route('/api/reports/<int:report_id>', methods=['DELETE'])
@login_required
def api_delete_report(report_id):
    """API endpoint to delete a report (called via fetch)."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "DELETE FROM reports WHERE id = ? AND user_id = ?",
        (report_id, user_id)
    )
    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Report deleted.'})


# ---------------------------------------------------------------------------
# Routes: Authentication (Register, Login, Logout)
# ---------------------------------------------------------------------------

@app.route('/register', methods=['GET', 'POST'])
def register():
    """User Registration with hashed passwords."""
    if session.get('user_id'):
        return redirect(url_for('dashboard'))

    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        email = request.form.get('email', '').strip().lower()
        password = request.form.get('password', '')
        confirm_password = request.form.get('confirm_password', '')

        if not username or not email or not password:
            flash('Please complete all registration fields.', 'error')
            return render_template('register.html')

        if len(username) < 3:
            flash('Username must be at least 3 characters.', 'error')
            return render_template('register.html')

        if '@' not in email or '.' not in email:
            flash('Please enter a valid email address.', 'error')
            return render_template('register.html')

        if len(password) < 6:
            flash('Password must be at least 6 characters.', 'error')
            return render_template('register.html')

        if confirm_password and password != confirm_password:
            flash('Passwords do not match. Please verify and retype.', 'error')
            return render_template('register.html')

        conn = get_db()
        cursor = conn.cursor()

        # Check existing user (case-insensitive)
        cursor.execute("""
            SELECT id FROM users 
            WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
        """, (username, email))
        existing_user = cursor.fetchone()

        if existing_user:
            flash('Username or email is already registered. Please login.', 'error')
            conn.close()
            return render_template('register.html')

        password_hash = generate_password_hash(password)
        cursor.execute("""
            INSERT INTO users (username, email, password_hash)
            VALUES (?, ?, ?)
        """, (username, email, password_hash))
        conn.commit()

        user_id = cursor.lastrowid
        conn.close()

        # Automatically log the newly registered user in
        session.permanent = True
        session['user_id'] = user_id
        session['username'] = username
        session['email'] = email
        flash(f'Account created successfully! Welcome to ASTRA, {username}.', 'success')
        return redirect(url_for('dashboard'))

    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    """User Authentication."""
    if session.get('user_id'):
        return redirect(url_for('dashboard'))

    next_url = request.args.get('next') or request.form.get('next') or url_for('dashboard')
    # Safe redirect check
    if not next_url.startswith('/') or next_url.startswith('//'):
        next_url = url_for('dashboard')

    if request.method == 'POST':
        identifier = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        if not identifier or not password:
            flash('Please enter both username/email and password.', 'error')
            return render_template('login.html', next=next_url)

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, username, email, password_hash FROM users
            WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)
        """, (identifier, identifier))
        user = cursor.fetchone()
        conn.close()

        if user and check_password_hash(user['password_hash'], password):
            session.permanent = True
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['email'] = user['email']
            flash(f'Logged in successfully. Welcome back, {user["username"]}!', 'success')
            return redirect(next_url)
        else:
            flash('Invalid username or password. Please verify your credentials.', 'error')

    return render_template('login.html', next=next_url)


@app.route('/logout')
def logout():
    """Terminate current user session."""
    session.clear()
    flash('You have been logged out of the ASTRA network.', 'info')
    return redirect(url_for('login'))


# ---------------------------------------------------------------------------
# API Endpoints: Prototype SOS Telemetry
# ---------------------------------------------------------------------------

@app.route('/api/sos-log', methods=['POST'])
def api_sos_log():
    """Log prototype SOS broadcast telemetry."""
    data = request.get_json(silent=True) or {}
    coords = str(data.get('coords', 'Unknown'))
    timestamp = str(data.get('timestamp', datetime.utcnow().isoformat()))
    user_id = session.get('user_id')

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO sos_logs (user_id, coords, timestamp)
        VALUES (?, ?, ?)
    """, (user_id, coords, timestamp))
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'message': 'Emergency SOS telemetry logged in safe prototype mode.'
    })


@app.route('/api/contacts', methods=['GET', 'POST'])
def api_contacts():
    """API endpoint to retrieve and create emergency contacts for the active session."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()

    if request.method == 'POST':
        data = request.get_json(silent=True) or request.form
        name = str(data.get('name', '')).strip()
        phone = str(data.get('phone', '')).strip()
        relation = str(data.get('relation', 'Emergency Contact')).strip()
        email = str(data.get('email', '')).strip()

        if not name or not phone:
            conn.close()
            return jsonify({'status': 'error', 'message': 'Both Name and Phone number are required.'}), 400

        cursor.execute("""
            INSERT INTO contacts (user_id, name, phone, relation, email)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, name, phone, relation, email))
        conn.commit()
        contact_id = cursor.lastrowid
        conn.close()

        return jsonify({
            'status': 'success',
            'message': f'Contact "{name}" added successfully.',
            'contact': {
                'id': contact_id,
                'user_id': user_id,
                'name': name,
                'phone': phone,
                'relation': relation,
                'email': email
            }
        })

    # GET
    if user_id:
        cursor.execute("SELECT id, name, phone, relation, email FROM contacts WHERE user_id = ? ORDER BY id DESC", (user_id,))
    else:
        cursor.execute("SELECT id, name, phone, relation, email FROM contacts ORDER BY id DESC LIMIT 10")
    
    rows = cursor.fetchall()
    conn.close()

    contacts_list = [dict(r) for r in rows]
    return jsonify({
        'status': 'success',
        'count': len(contacts_list),
        'contacts': contacts_list
    })


@app.route('/api/contacts/<int:contact_id>', methods=['DELETE', 'POST'])
def api_delete_contact(contact_id):
    """Delete a contact for the active user."""
    user_id = session.get('user_id')
    conn = get_db()
    cursor = conn.cursor()

    if user_id:
        cursor.execute("DELETE FROM contacts WHERE id = ? AND user_id = ?", (contact_id, user_id))
    else:
        cursor.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))

    conn.commit()
    conn.close()
    return jsonify({'status': 'success', 'message': 'Contact deleted successfully.'})


@app.route('/api/sos-broadcast', methods=['POST'])
def api_sos_broadcast():
    """Broadcast an emergency SOS telemetry ping to all configured contacts."""
    data = request.get_json(silent=True) or {}
    coords = data.get('coords') or 'Coordinates Pending'
    coords_str = f"Lat: {coords.get('latitude', '')}, Lng: {coords.get('longitude', '')}" if isinstance(coords, dict) else str(coords)
    timestamp = str(data.get('timestamp') or datetime.utcnow().isoformat())
    user_id = session.get('user_id')

    conn = get_db()
    cursor = conn.cursor()

    # Log in SOS logs table
    cursor.execute("""
        INSERT INTO sos_logs (user_id, coords, timestamp)
        VALUES (?, ?, ?)
    """, (user_id, coords_str, timestamp))
    log_id = cursor.lastrowid

    # Fetch contacts to confirm dispatch list
    if user_id:
        cursor.execute("SELECT id, name, phone, relation FROM contacts WHERE user_id = ?", (user_id,))
    else:
        cursor.execute("SELECT id, name, phone, relation FROM contacts LIMIT 10")

    alerted_contacts = [dict(r) for r in cursor.fetchall()]
    conn.commit()
    conn.close()

    return jsonify({
        'status': 'success',
        'broadcast_id': log_id,
        'timestamp': timestamp,
        'coords': coords_str,
        'alerted_count': len(alerted_contacts),
        'contacts': alerted_contacts,
        'message': f'Emergency distress telemetry dispatched to {len(alerted_contacts)} guardian(s).'
    })


# ---------------------------------------------------------------------------
# Application Entry Point
# ---------------------------------------------------------------------------

if __name__ == '__main__':
    # Running locally in debug mode
    print("================================================================")
    print("  ASTRA - Women Safety & Emergency Defense Network is starting  ")
    print("  Local URL: http://127.0.0.1:5000/                             ")
    print("================================================================")
    app.run(host='127.0.0.1', port=5000, debug=True)

