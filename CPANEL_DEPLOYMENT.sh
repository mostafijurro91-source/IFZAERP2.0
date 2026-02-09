#!/bin/bash
# IFZA ERP - cPanel Deployment Script

echo "🚀 IFZA ERP - cPanel Deployment Script"
echo "========================================"

# Step 1: Install dependencies
echo "📦 Installing dependencies..."
npm install

# Step 2: Build the app
echo "🔨 Building application..."
npm run build

# Check if build was successful
if [ -d "dist" ]; then
    echo "✅ Build successful!"
    echo ""
    echo "📝 Next Steps:"
    echo "1. Login to cPanel"
    echo "2. Open File Manager"
    echo "3. Navigate to public_html"
    echo "4. Upload all files from 'dist' folder to public_html"
    echo "5. Create .htaccess file with the content from 'public_html_htaccess.txt'"
    echo "6. Go to Supabase dashboard and add CORS origin: https://ifzaerp.com"
    echo "7. Access your site at https://ifzaerp.com"
    echo ""
    echo "📂 Files to upload (from dist/):"
    ls -la dist/
else
    echo "❌ Build failed! Check errors above."
    exit 1
fi
