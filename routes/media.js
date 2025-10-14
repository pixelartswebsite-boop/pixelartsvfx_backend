const express = require("express");
const router = express.Router();
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const Media = require("../models/Media");
const { verifyToken, requireAdmin } = require("../middleware/auth");
const streamifier = require("streamifier");

// Configure multer (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// Cloudinary config (make sure these are set in .env)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Helper function to upload to Cloudinary
const uploadToCloudinary = (buffer, mimetype) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "pixelarts-media",
        resource_type: mimetype.startsWith("video/") ? "video" : "image",
      },
      (error, result) => {
        if (error) {
          console.error("Cloudinary Upload Error:", error);
          reject(error);
        } else {
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// @desc    Get hero image (PUBLIC ROUTE - MUST COME BEFORE /:id)
// @route   GET /api/media/hero-image
// @access  Public
router.get("/hero-image", async (req, res) => {
  try {
    console.log('GET /api/media/hero-image - Fetching hero image...');
    
    // Find the one media item where isHeroImage is true and isActive is true
    const heroImage = await Media.findOne({ 
      isHeroImage: true, 
      isActive: true,
      type: 'image' // Ensure it's an image
    }).sort({ updatedAt: -1 }); // Get the most recently updated one

    console.log('Hero image found:', heroImage ? {
      id: heroImage._id,
      title: heroImage.title,
      url: heroImage.url,
      category: heroImage.category
    } : 'None');

    if (!heroImage) {
      return res.status(200).json({ 
        success: false, 
        message: "No hero image set" 
      });
    }

    res.json({
      success: true,
      image: {
        id: heroImage._id,
        url: heroImage.url,
        title: heroImage.title,
        description: heroImage.description
      }
    });
  } catch (error) {
    console.error('Error fetching hero image:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    });
  }
});

// @desc    Get all media items
// @route   GET /api/media
// @access  Private (admin)
router.get("/", async (req, res) => {
  try {
    const media = await Media.find()
      .sort({ createdAt: -1 })
      .populate("uploadedBy", "username email");

    res.status(200).json({
      success: true,
      data: media,
      message: "Media items retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching media:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch media items",
      error: error.message,
    });
  }
});

// @desc    Create a new media item
// @route   POST /api/media
// @access  Private (admin)
router.post(
  "/",
  verifyToken,
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log('POST /api/media - Request body:', {
        category: req.body.category,
        isHeroImage: req.body.isHeroImage,
        title: req.body.title,
        hasFile: !!req.file
      });

      let fileUrl = req.body.url || null;
      let isHeroImage = req.body.isHeroImage === 'true';
      let category = req.body.category || 'showreel';
      
      // If category is 'hero-image', automatically set isHeroImage to true
      if (category === 'hero-image') {
        isHeroImage = true;
        console.log('Category is hero-image, setting isHeroImage to true');
      }

      console.log('POST /api/media - Processed values:', { category, isHeroImage });

      // Validate that hero images must be images
      if (isHeroImage && req.file && !req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          message: "Hero image must be an image file, not a video",
        });
      }

      // If this is going to be a hero image, unset all other hero images
      if (isHeroImage) {
        const updateResult = await Media.updateMany({}, { isHeroImage: false });
        console.log(`Unset ${updateResult.modifiedCount} previous hero images`);
      }

      // Handle file upload
      if (req.file) {
        try {
          console.log('Uploading file to Cloudinary:', {
            mimetype: req.file.mimetype,
            size: req.file.size,
            originalname: req.file.originalname
          });

          const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype);
          
          console.log('Cloudinary upload successful:', {
            public_id: uploadResult.public_id,
            secure_url: uploadResult.secure_url
          });

          // Generate a thumbnail if it's a video
          let thumbnailUrl = uploadResult.secure_url;
          if (req.file.mimetype.startsWith("video/")) {
            thumbnailUrl = cloudinary.url(uploadResult.public_id + ".jpg", {
              resource_type: "video",
              format: "jpg",
              transformation: [{ width: 600, height: 400, crop: "fill" }],
            });
          }

          // Parse tags if they exist
          let tagsArray = [];
          if (req.body.tags) {
            if (typeof req.body.tags === 'string') {
              tagsArray = req.body.tags
                .split(',')
                .map(tag => tag.trim())
                .filter(tag => tag);
            } else if (Array.isArray(req.body.tags)) {
              tagsArray = req.body.tags;
            }
          }

          // Save media record with Cloudinary URL
          const media = new Media({
            title: req.body.title,
            description: req.body.description || '',
            type: req.file.mimetype.startsWith("video/") ? "video" : "image",
            url: uploadResult.secure_url,
            thumbnailUrl: thumbnailUrl,
            tags: tagsArray,
            category: category,
            isHeroImage: isHeroImage,
            isActive: true,
            isFeatured: false,
            sortOrder: 0,
            viewCount: 0,
            uploadedBy: req.admin._id,
            cloudinaryPublicId: uploadResult.public_id,
            metadata: {
              uploadSource: "file-upload",
              originalName: req.file.originalname,
              quality: "high",
            },
            seo: {
              keywords: [],
              altText: req.body.title,
            },
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
          });

          await media.save();

          console.log('Media saved successfully:', {
            id: media._id,
            title: media.title,
            category: media.category,
            isHeroImage: media.isHeroImage,
            url: media.url
          });

          return res.status(201).json({
            success: true,
            message: isHeroImage ? "Hero image uploaded successfully" : "Media created successfully",
            data: { media },
          });
        } catch (uploadError) {
          console.error("Cloudinary Upload Error:", uploadError);
          return res.status(500).json({
            success: false,
            message: "Upload to Cloudinary failed",
            error: uploadError.message,
          });
        }
      } else if (req.body.url) {
        // Handle URL-based upload
        console.log('Creating media from URL:', req.body.url);

        // Validate that hero images must be images
        if (isHeroImage && req.body.type !== 'image') {
          return res.status(400).json({
            success: false,
            message: "Hero image must be an image, not a video",
          });
        }

        // Parse tags if they exist
        let tagsArray = [];
        if (req.body.tags) {
          if (typeof req.body.tags === 'string') {
            tagsArray = req.body.tags
              .split(',')
              .map(tag => tag.trim())
              .filter(tag => tag);
          } else if (Array.isArray(req.body.tags)) {
            tagsArray = req.body.tags;
          }
        }

        const media = new Media({
          title: req.body.title,
          description: req.body.description || '',
          type: req.body.type || "image",
          url: req.body.url,
          thumbnailUrl: req.body.url,
          tags: tagsArray,
          category: category,
          isHeroImage: isHeroImage,
          isActive: true,
          isFeatured: false,
          sortOrder: 0,
          viewCount: 0,
          uploadedBy: req.admin._id,
          metadata: {
            uploadSource: "url",
            quality: "high",
          },
          seo: {
            keywords: [],
            altText: req.body.title,
          },
        });

        await media.save();

        console.log('Media saved successfully (URL):', {
          id: media._id,
          title: media.title,
          category: media.category,
          isHeroImage: media.isHeroImage
        });

        return res.status(201).json({
          success: true,
          message: isHeroImage ? "Hero image set successfully" : "Media created successfully (URL only)",
          data: { media },
        });
      } else {
        return res.status(400).json({
          success: false,
          message: "Please provide either a file or a URL",
        });
      }
    } catch (error) {
      console.error("Error creating media:", error);
      res.status(500).json({
        success: false,
        message: "Server error",
        error: error.message,
      });
    }
  }
);

// @desc    Update a media item
// @route   PUT /api/media/:id
// @access  Private (admin)
router.put(
  "/:id",
  verifyToken,
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      console.log('PUT /api/media/:id - Request params:', {
        id: req.params.id,
        category: req.body.category,
        isHeroImage: req.body.isHeroImage,
        hasFile: !!req.file
      });

      const media = await Media.findById(req.params.id);

      if (!media) {
        return res.status(404).json({
          success: false,
          message: "Media not found",
        });
      }

      let newIsHeroImage = req.body.isHeroImage === 'true';
      let newCategory = req.body.category || media.category;

      // If category is 'hero-image', automatically set isHeroImage to true
      if (newCategory === 'hero-image') {
        newIsHeroImage = true;
        console.log('Category is hero-image, setting isHeroImage to true');
      }

      console.log('PUT /api/media - Processed values:', { newCategory, newIsHeroImage });

      // Determine if the media item is, or will be, an image
      const isImage = req.file 
        ? req.file.mimetype.startsWith("image/")
        : media.type === 'image';

      // Validate that hero images must be images
      if (newIsHeroImage && !isImage) {
        return res.status(400).json({
          success: false,
          message: "Hero image must be an image, not a video",
        });
      }

      // Check if hero status is changing to true
      if (newIsHeroImage && isImage) {
        const updateResult = await Media.updateMany(
          { _id: { $ne: req.params.id } }, 
          { isHeroImage: false }
        );
        console.log(`Unset ${updateResult.modifiedCount} previous hero images during update`);
      }

      // If a new file is uploaded, update Cloudinary
      if (req.file) {
        try {
          console.log('Uploading new file to Cloudinary');

          // Delete old file from Cloudinary if it exists
          if (media.cloudinaryPublicId) {
            try {
              await cloudinary.uploader.destroy(media.cloudinaryPublicId);
              console.log('Deleted old file from Cloudinary:', media.cloudinaryPublicId);
            } catch (deleteError) {
              console.error('Error deleting old file:', deleteError);
              // Continue anyway
            }
          }

          // Upload new file
          const uploadResult = await uploadToCloudinary(req.file.buffer, req.file.mimetype);

          console.log('New file uploaded successfully:', uploadResult.public_id);

          let thumbnailUrl = uploadResult.secure_url;
          if (req.file.mimetype.startsWith("video/")) {
            thumbnailUrl = cloudinary.url(
              uploadResult.public_id + ".jpg",
              {
                resource_type: "video",
                format: "jpg",
                transformation: [{ width: 600, height: 400, crop: "fill" }],
              }
            );
          }

          // Update media with new file info
          media.url = uploadResult.secure_url;
          media.thumbnailUrl = thumbnailUrl;
          media.cloudinaryPublicId = uploadResult.public_id;
          media.type = req.file.mimetype.startsWith("video/") ? "video" : "image";
          media.fileSize = req.file.size;
          media.mimeType = req.file.mimetype;
        } catch (uploadError) {
          console.error('Upload error:', uploadError);
          return res.status(500).json({
            success: false,
            message: "Failed to upload new file",
            error: uploadError.message,
          });
        }
      }

      // Update other fields
      if (req.body.title) media.title = req.body.title;
      if (req.body.description !== undefined) media.description = req.body.description;
      if (req.body.category) media.category = newCategory;
      
      // Handle tags
      if (req.body.tags !== undefined) {
        if (typeof req.body.tags === 'string') {
          media.tags = req.body.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag);
        } else if (Array.isArray(req.body.tags)) {
          media.tags = req.body.tags;
        }
      }

      if (req.body.isActive !== undefined) media.isActive = req.body.isActive === 'true' || req.body.isActive === true;
      if (req.body.isFeatured !== undefined) media.isFeatured = req.body.isFeatured === 'true' || req.body.isFeatured === true;
      
      // Update isHeroImage
      media.isHeroImage = newIsHeroImage;

      // Update metadata and SEO
      if (req.body.metadata) {
        media.metadata = {
          ...media.metadata,
          ...req.body.metadata,
          uploadSource: req.file ? "file-upload" : media.metadata.uploadSource,
        };
      }

      if (req.body.seo) {
        media.seo = {
          ...media.seo,
          ...req.body.seo,
        };
      }

      // Save updates
      await media.save();

      console.log('Media updated successfully:', {
        id: media._id,
        title: media.title,
        category: media.category,
        isHeroImage: media.isHeroImage,
        url: media.url
      });

      res.status(200).json({
        success: true,
        message: newIsHeroImage ? "Hero image updated successfully" : "Media updated successfully",
        data: { media },
      });
    } catch (error) {
      console.error("Error updating media:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update media",
        error: error.message,
      });
    }
  }
);

// @desc    Delete a media item
// @route   DELETE /api/media/:id
// @access  Private (admin)
router.delete("/:id", verifyToken, requireAdmin, async (req, res) => {
  try {
    const media = await Media.findById(req.params.id);

    if (!media) {
      return res.status(404).json({
        success: false,
        message: "Media not found",
      });
    }

    // Delete from Cloudinary if it was uploaded there
    if (media.cloudinaryPublicId) {
      try {
        await cloudinary.uploader.destroy(media.cloudinaryPublicId);
        console.log('Deleted from Cloudinary:', media.cloudinaryPublicId);
      } catch (cloudinaryError) {
        console.error("Cloudinary deletion error:", cloudinaryError);
        // Continue with database deletion anyway
      }
    }

    // Delete from database
    await media.deleteOne();

    console.log('Media deleted successfully:', req.params.id);

    res.status(200).json({
      success: true,
      message: "Media deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting media:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete media",
      error: error.message,
    });
  }
});

module.exports = router;