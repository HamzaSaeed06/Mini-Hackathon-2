/**
 * Cloudinary Upload Utility
 * To use: 
 * 1. Create a Cloudinary account
 * 2. Get your Cloud Name
 * 3. Create an Unsigned Upload Preset
 */

/** Cloudinary config - Update cloudName & uploadPreset for your account */
export const CLOUDINARY_CONFIG = {
    cloudName: "demo",
    uploadPreset: "unsigned_preset"
};

export async function uploadToCloudinary(file, cloudName, uploadPreset) {
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", uploadPreset);

    try {
        const response = await fetch(url, {
            method: "POST",
            body: formData
        });

        if (!response.ok) throw new Error("Upload failed");

        const data = await response.json();
        return data.secure_url;
    } catch (error) {
        console.error("Cloudinary Error:", error);
        throw error;
    }
}
