"""
Data Analyser – Flask backend
Run:  python app.py
Open:  http://localhost:5000
"""
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import os
import logging
import traceback
from analysis import analyse_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB
ALLOWED_EXTENSIONS = {'csv', 'tsv', 'xls', 'xlsx', 'xlsm'}
MAX_ANALYSE_BYTES = 500 * 1024 * 1024

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

log = logging.getLogger('data_analyser')


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyse', methods=['POST'])
def analyse():
    """Single endpoint: upload + analyse."""
    try:
        # ── Validate request ──────────────────────────────────
        if 'file' not in request.files:
            log.warning("No file part in request")
            return jsonify({"ok": False, "error": "No file found in request. Please select a file and try again."}), 400

        file = request.files['file']
        if file.filename == '':
            log.warning("Empty filename")
            return jsonify({"ok": False, "error": "No file selected. Please choose a file."}), 400

        if not allowed_file(file.filename):
            log.warning(f"Unsupported file type: {file.filename}")
            return jsonify({"ok": False,
                            "error": f"Unsupported file type: '.{file.filename.rsplit('.', 1)[-1]}'. Please upload a CSV, TSV, XLS, or XLSX file."}), 400

        # ── Save file ─────────────────────────────────────────
        filename = secure_filename(file.filename)
        if not filename:
            filename = "uploaded_file"
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)

        try:
            file.save(filepath)
        except Exception as e:
            log.error(f"File save error: {e}")
            return jsonify({"ok": False, "error": f"Could not save file: {str(e)}"}), 500

        # ── Size check ────────────────────────────────────────
        file_size = os.path.getsize(filepath)
        if file_size == 0:
            os.remove(filepath)
            return jsonify({"ok": False, "error": "The uploaded file is empty (0 bytes)."}), 400

        if file_size > MAX_ANALYSE_BYTES:
            os.remove(filepath)
            size_mb = round(file_size / (1024 * 1024), 1)
            return jsonify({
                "ok": False,
                "error": f"File size ({size_mb} MB) exceeds the 500 MB limit. Please upload a smaller file."
            }), 400

        log.info(f"File saved: {filename} ({round(file_size/1024, 1)} KB)")

        # ── Run analysis ──────────────────────────────────────
        result = analyse_file(filepath)

        if not result.get("valid", False):
            return jsonify({"ok": False, "error": result.get("message", "Analysis failed.")}), 400

        return jsonify({"ok": True, "filename": filename, "result": result})

    except Exception as e:
        log.error(f"Unhandled error in /analyse: {e}\n{traceback.format_exc()}")
        return jsonify({
            "ok": False,
            "error": f"An unexpected error occurred: {str(e)}. Please check the log file for details."
        }), 500


@app.errorhandler(413)
def too_large(e):
    return jsonify({
        "ok": False,
        "error": "File size exceeds the 500 MB limit. Please upload a smaller file."
    }), 413


@app.errorhandler(500)
def server_error(e):
    log.error(f"Server error: {e}")
    return jsonify({
        "ok": False,
        "error": "Internal server error. Please check the log file for details."
    }), 500


if __name__ == '__main__':
    print("\n  ✦  Data Analyser running at  http://localhost:5000\n")
    app.run(debug=True, port=5000)
