"""
Data Analyser – Flask backend
Run:  python app.py
Open:  http://localhost:5000
"""
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import os
from analysis import analyse_file

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__,
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500 MB limit
ALLOWED_EXTENSIONS = {'csv', 'tsv', 'xls', 'xlsx', 'xlsm'}
MAX_ANALYSE_BYTES = 500 * 1024 * 1024  # 500 MB

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/analyse', methods=['POST'])
def analyse():
    """Single endpoint: upload file + run analysis."""
    if 'file' not in request.files:
        return jsonify({"ok": False, "error": "No file part in request."}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"ok": False, "error": "No file selected."}), 400

    if not allowed_file(file.filename):
        return jsonify({"ok": False,
                        "error": "Unsupported file type. Please upload a CSV, TSV, XLS, or XLSX file."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)

    # Check file size after saving
    file_size = os.path.getsize(filepath)
    if file_size > MAX_ANALYSE_BYTES:
        os.remove(filepath)
        size_mb = round(file_size / (1024 * 1024), 1)
        return jsonify({
            "ok": False,
            "error": f"File size ({size_mb} MB) exceeds the 500 MB limit. Please upload a smaller file."
        }), 400

    result = analyse_file(filepath)
    return jsonify({"ok": True, "filename": filename, "result": result})


@app.errorhandler(413)
def too_large(e):
    return jsonify({
        "ok": False,
        "error": "File size exceeds the 500 MB limit. Please upload a smaller file."
    }), 413


if __name__ == '__main__':
    print("\n  ✦  Data Analyser running at  http://localhost:5000\n")
    app.run(debug=True, port=5000)
