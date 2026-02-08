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
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB limit
ALLOWED_EXTENSIONS = {'csv', 'tsv', 'xls', 'xlsx', 'xlsm'}

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

_current_file: str | None = None  # path of last uploaded file


def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload():
    global _current_file

    if 'file' not in request.files:
        return jsonify({"ok": False, "error": "No file part in request"}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({"ok": False, "error": "No file selected"}), 400

    if not allowed_file(file.filename):
        return jsonify({"ok": False,
                        "error": "Unsupported file type. Please upload CSV, TSV, XLS, or XLSX."}), 400

    filename = secure_filename(file.filename)
    filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    file.save(filepath)
    _current_file = filepath

    return jsonify({"ok": True, "filename": filename})


@app.route('/analyse', methods=['GET'])
def analyse():
    if not _current_file or not os.path.exists(_current_file):
        return jsonify({"ok": False,
                        "error": "No file uploaded yet. Please upload a file first."}), 400

    result = analyse_file(_current_file)
    return jsonify({"ok": True, "result": result})


if __name__ == '__main__':
    print("\n  ✦  Data Analyser running at  http://localhost:5000\n")
    app.run(debug=True, port=5000)