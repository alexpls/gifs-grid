from PIL import Image


def sample_frames_evenly(gif_path, num_samples=5):
    frames = []
    try:
        with Image.open(gif_path) as img:
            try:
                frame_count = img.n_frames
            except:
                frame_count = 1
            
            if frame_count == 1: # stills...
                frames.append(img.copy())
                return frames
            
            if frame_count <= num_samples:
                frame_indices = list(range(frame_count))
            else:
                step = frame_count / num_samples
                frame_indices = [int(i * step) for i in range(num_samples)]
            
            for frame_idx in frame_indices:
                try:
                    img.seek(frame_idx)
                    frames.append(img.copy())
                except:
                    continue
            
            return frames if frames else None
            
    except Exception as e:
        return None
