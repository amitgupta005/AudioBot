"""
Direct patch for coqui-tts isin_mps_friendly error
This script directly patches the autoregressive.py file
"""

import sys
from pathlib import Path

def find_autoregressive_file():
    """Find the autoregressive.py file in common locations"""
    
    # Check common virtual environment locations
    possible_paths = [
        # Virtual environment (current directory)
        Path(".venv/Lib/site-packages/TTS/tts/layers/tortoise/autoregressive.py"),
        Path("venv/Lib/site-packages/TTS/tts/layers/tortoise/autoregressive.py"),
        
        # User directory (shown in your error message)
        Path(r"C:\Users\amit7\OneDrive\Desktop\AudioBot\.venv\Lib\site-packages\TTS\tts\layers\tortoise\autoregressive.py"),
    ]
    
    # Also try finding via site-packages
    try:
        import site
        for site_dir in site.getsitepackages():
            site_path = Path(site_dir) / "TTS" / "tts" / "layers" / "tortoise" / "autoregressive.py"
            possible_paths.append(site_path)
    except:
        pass
    
    for path in possible_paths:
        if path.exists():
            print(f"✓ Found file at: {path}")
            return path
    
    return None

def patch_file(filepath):
    """Patch the autoregressive.py file"""
    
    print(f"\nReading file: {filepath}")
    
    # Read the file
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"ERROR reading file: {e}")
        return False
    
    # Check if already patched
    if "from transformers.pytorch_utils import isin_mps_friendly" not in content:
        print("✓ File appears to already be patched or doesn't need patching")
        return True
    
    print("Applying patch...")
    
    # Replace the problematic import
    old_import = "from transformers.pytorch_utils import isin_mps_friendly as isin"
    
    new_import = """# Patched for transformers compatibility
try:
    from transformers.pytorch_utils import isin_mps_friendly as isin
except ImportError:
    # For newer transformers versions where isin_mps_friendly was removed
    import torch
    isin = torch.isin"""
    
    new_content = content.replace(old_import, new_import)
    
    # Backup the original file
    backup_file = filepath.with_suffix('.py.bak')
    try:
        with open(backup_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"✓ Backup created: {backup_file}")
    except Exception as e:
        print(f"WARNING: Could not create backup: {e}")
    
    # Write the patched version
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print("✓ Patch applied successfully!")
        return True
    except Exception as e:
        print(f"ERROR writing patched file: {e}")
        return False

def main():
    print("=" * 70)
    print("Coqui-TTS isin_mps_friendly Direct Patcher")
    print("=" * 70)
    print()
    
    # Find the file
    filepath = find_autoregressive_file()
    
    if not filepath:
        print("\n✗ ERROR: Could not find autoregressive.py file")
        print("\nPlease ensure coqui-tts is installed:")
        print("  pip install coqui-tts==0.27.5")
        print("\nIf it is installed, manually edit this file:")
        print("  .venv\\Lib\\site-packages\\TTS\\tts\\layers\\tortoise\\autoregressive.py")
        print("\nFind line 12 with:")
        print("  from transformers.pytorch_utils import isin_mps_friendly as isin")
        print("\nReplace with:")
        print("  try:")
        print("      from transformers.pytorch_utils import isin_mps_friendly as isin")
        print("  except ImportError:")
        print("      import torch")
        print("      isin = torch.isin")
        return 1
    
    # Apply the patch
    if patch_file(filepath):
        print("\n" + "=" * 70)
        print("✓ SUCCESS!")
        print("=" * 70)
        print("\nYou can now use coqui-tts without import errors.")
        print("\nTest with:")
        print("  python -c \"from TTS.tts.layers.tortoise.autoregressive import UnifiedVoice; print('Success!')\"")
        return 0
    else:
        print("\n✗ FAILED: Patch could not be applied")
        return 1

if __name__ == "__main__":
    sys.exit(main())