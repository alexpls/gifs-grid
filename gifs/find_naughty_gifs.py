#!/usr/bin/env python3
import sys
import shutil
from pathlib import Path
from PIL import Image
from transformers import pipeline
import torch
from gif_utils import sample_frames_evenly


def extract_frames(gif_path, num_frames=5):
    frames = sample_frames_evenly(gif_path, num_frames)
    if not frames:
        return []
    
    rgb_frames = []
    for frame in frames:
        if frame.mode != 'RGB':
            frame = frame.convert('RGB')
        rgb_frames.append(frame)
    
    return rgb_frames

def process_gifs(input_dir, threshold=0.4):
    input_path = Path(input_dir)
    if not input_path.exists():
        print(f"Error: Directory {input_dir} does not exist")
        sys.exit(1)
    
    nsfw_dir = input_path / "nsfw"
    nsfw_dir.mkdir(exist_ok=True)
    
    # TODO: a buncha gifs have nsfw _text_ content in them. those slip through
    # the cracks with these image classifiers.
    classifiers = [
        pipeline("image-classification", 
                model="Falconsai/nsfw_image_detection", # labels (normal,nsfw)
                device=0),
        pipeline("image-classification", 
                model="AdamCodd/vit-base-nsfw-detector", # labels (SFW,NSFW) - particularly prudish!
                device=0)
    ]
    
    gif_files = list(input_path.glob("*.gif"))
    total_files = len(gif_files)
    
    print(f"{total_files} GIFs")
    
    moved_count = 0
    
    for i, gif_path in enumerate(gif_files):
        if i % 10 == 0:
            print(f"Processing {i}/{total_files} ({i/total_files*100:.1f}%)...")
        
        frames = extract_frames(gif_path)
        if not frames:
            continue
        
        max_nsfw_score = 0
        try:
            for classifier in classifiers:
                for frame in frames:
                    results = classifier(frame)
                    for result in results:
                        label = result['label'].lower()
                        if label == "nsfw":
                            max_nsfw_score = max(max_nsfw_score, result['score'])
        except Exception as e:
            print(f"Error classifying {gif_path.name}: {e}")
            continue
        
        if max_nsfw_score >= threshold:
            dest_path = nsfw_dir / gif_path.name
            shutil.move(str(gif_path), str(dest_path))
            moved_count += 1
            print(f"  Moved {gif_path.name} (score: {max_nsfw_score:.2f})")
    
    print(f"\nComplete! Moved {moved_count} NSFW files to {nsfw_dir}")

if __name__ == "__main__":
    process_gifs("gifs")
