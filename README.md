# ASTRA — Women Safety & Emergency Support

ASTRA is a web-based women’s safety project designed to bring emergency contacts, incident reporting, and quick access to safety guidance into one interface. It uses a Flask backend and SQLite database, with HTML, CSS, and JavaScript for the web interface.

> **Important:** ASTRA is an educational prototype, not a verified emergency-response service. The SOS feature records a prototype event and returns the configured contacts; it does not itself send SMS messages, make phone calls, or guarantee that anyone receives an alert. In an actual emergency in India, call **112** directly.

## Features

- **User registration and login** with password hashing.
- **Safety dashboard** with an SOS interface and emergency information.
- **Emergency contact management** to add, view, and remove contacts.
- **Incident reporting** to record incident type, date/time, location, urgency, and description.
- **Safety assistant page** with situational safety guidance.
- **SOS event logging** to store the submitted coordinates/text and timestamp in SQLite.
- **JSON API endpoints** for contact management and prototype SOS logging/broadcasting.
- **Dark, red-accented interface** focused on a modern emergency-support experience.

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Python, Flask
- **Database:** SQLite
- **Authentication utilities:** Werkzeug password hashing

## Project Structure

```text
astra/
├── app.py                  # Flask application and API routes
├── requirements.txt        # Python dependencies
├── database.db             # SQLite database (may be created/initialized by the app)
├── index.html              # Standalone/landing page file
├── style.css               # Additional stylesheet
├── static/
│   ├── script.js           # Frontend interactions
│   └── style.css           # Main static stylesheet
├── templates/
│   ├── base.html           # Shared page layout/navigation
│   ├── index.html           # Landing page template
│   ├── dashboard.html      # Dashboard
│   ├── login.html           # Login page
│   ├── register.html        # Registration page
│   ├── contacts.html       # Emergency contacts
│   ├── report.html         # Incident reporting
│   └── assistant.html      # Safety assistant
└── vercel.json             # Deployment configuration
```

## Requirements

- Python 3.10 or newer recommended
- pip
- A modern web browser

## Run Locally

1. **Download or clone the project**, then open a terminal in the project folder.

2. **Create and activate a virtual environment** (recommended):

   **Windows (PowerShell)**
   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

   **macOS / Linux**
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure the Flask secret key.** Before using the app beyond a local demo, set a strong, private `SECRET_KEY` environment variable. The application should be configured to read this value rather than use a hard-coded development key.

   **Windows PowerShell**
   ```powershell
   $env:SECRET_KEY = "replace-with-a-long-random-secret"
   ```

   **macOS / Linux**
   ```bash
   export SECRET_KEY="replace-with-a-long-random-secret"
   ```

5. **Start the application:**
   ```bash
   python app.py
   ```

6. Open the local address printed in the terminal (commonly `http://127.0.0.1:5000`). If the app file does not start the development server directly, run it with Flask instead:
   ```bash
   flask --app app run --debug
   ```

## Main Pages

| Page | Path | Purpose |
|---|---|---|
| Landing page | `/` | Project introduction and safety entry point |
| Dashboard | `/dashboard` | Main user dashboard |
| Emergency contacts | `/contacts` | Manage trusted contacts |
| Safety assistant | `/assistant` | View safety guidance |
| Incident reports | `/report` | Create and review incident reports |
| Register | `/register` | Create an account |
| Login | `/login` | Sign in to an account |

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/sos-log` | Save a prototype SOS log entry |
| `GET`, `POST` | `/api/contacts` | Retrieve or add contacts |
| `DELETE`, `POST` | `/api/contacts/<contact_id>` | Remove a contact |
| `POST` | `/api/sos-broadcast` | Log an SOS event and return the contact list associated with it |
| `DELETE` | `/api/reports/<report_id>` | Delete a report through the API |

## Safety, Privacy, and Deployment Notes

- Use fictional data while testing; do not put real personal or emergency-contact details into a public demo.
- Keep `database.db`, credentials, secret keys, and other private data out of public repositories when they contain real information.
- Use a strong secret key and HTTPS for any deployed environment. Review access controls and ensure users can access or delete only records they are authorized to manage.
- The current SOS broadcast endpoint is a **prototype logging/response flow**. Connect and test a trusted notification provider and real emergency workflow before describing it as a live alert system.
- This project does not replace local emergency services or professional safety support.

## Future Improvements

- Integrate an opt-in, verified SMS/notification provider for emergency contacts.
- Add stronger authorization checks and privacy controls for incident reports and API endpoints.
- Add automated tests, input validation, and production deployment configuration.
- Provide clear delivery status and error handling for any real notifications.

## License

No license is specified yet. Add a `LICENSE` file if you intend to publish or distribute this project.
