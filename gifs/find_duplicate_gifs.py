#!/usr/bin/env python3

import os
import hashlib
import shutil
from pathlib import Path
from PIL import Image
import imagehash
from gif_utils import sample_frames_evenly

def get_gif_frame_hashes(filepath, sample_frames=5):
    frames = sample_frames_evenly(filepath, sample_frames)
    if not frames:
        return None
    
    hashes = []
    for frame in frames:
        hashes.append(str(imagehash.average_hash(frame)))
    
    return hashes


def find_and_move_duplicates():
    gif_dir = Path("gifs")
    duplicates_dir = Path("gifs/duplicates")
    
    duplicates_dir.mkdir(exist_ok=True)
    
    gif_files = list(gif_dir.glob("*.gif"))
    print(f"Found {len(gif_files)} GIFs")
    
    seen_frame_signatures = {}
    moved_count = 0
    
    for i, gif_path in enumerate(gif_files):
        if i % 100 == 0:
            print(f"Processing: {i}/{len(gif_files)}")
        
        frame_hashes = get_gif_frame_hashes(gif_path)
        if frame_hashes:
            signature = "-".join(frame_hashes)
            
            if signature in seen_frame_signatures:
                original = seen_frame_signatures[signature]
                dest_path = duplicates_dir / gif_path.name
                counter = 1
                while dest_path.exists():
                    dest_path = duplicates_dir / f"{gif_path.stem}_{counter}{gif_path.suffix}"
                    counter += 1
                
                shutil.move(str(gif_path), str(dest_path))
                print(f"Moved visually similar: {gif_path.name} (similar to {original.name})")
                moved_count += 1
            else:
                seen_frame_signatures[signature] = gif_path
    
    print(f"\nDone! Moved {moved_count} duplicate GIFs to '{duplicates_dir}'")


if __name__ == '__main__':
    find_and_move_duplicates()
