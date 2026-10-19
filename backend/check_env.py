import sys

packages = ["ultralytics", "cv2", "numpy", "easyocr", "fastapi", "uvicorn", "pydantic", "torch", "torchvision"]

print(f"Python: {sys.version}")
print(f"Python Executable: {sys.executable}\n")

for pkg in packages:
    try:
        mod = __import__(pkg)
        ver = getattr(mod, "__version__", "installed")
        print(f"  [+] {pkg}: {ver}")
    except ImportError as e:
        print(f"  [-] {pkg}: NOT installed ({e})")
