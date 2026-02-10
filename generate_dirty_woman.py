from google import genai
import os
import sys

def generate_images():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("Error: GEMINI_API_KEY environment variable not set.")
        sys.exit(1)

    client = genai.Client(api_key=api_key)
    prompt = "Dirty Woman: Fashion film, Caravaggio style, dirty Victorian aesthetic, dirt floor, dramatic window daylight, high contrast, cinematic lighting, gritty texture, historical drama atmosphere, moody and dark."
    output_dir = os.path.expanduser("~/projects/Dirty_Woman/images/final/")
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Generating 12 images with prompt: {prompt}")
    
    total_images = 12
    batch_size = 4
    count = 0
    
    for i in range(0, total_images, batch_size):
        print(f"Generating batch {i//batch_size + 1}...")
        # Simplest form based on docs
        response = client.models.generate_images(
            model="imagen-4.0-generate-001",
            prompt=prompt,
            config={
                'number_of_images': batch_size,
                'aspect_ratio': '16:9',
                'safety_filter_level': 'BLOCK_LOW_AND_ABOVE',
                'person_generation': 'ALLOW_ADULT',
            }
        )
        
        for image_response in response.generated_images:
            count += 1
            filename = f"dirty_woman_{count:02d}.jpg"
            filepath = os.path.join(output_dir, filename)
            # Save the image content
            with open(filepath, "wb") as f:
                f.write(image_response.image.image_bytes)
            print(f"Saved: {filepath}")

if __name__ == "__main__":
    generate_images()
