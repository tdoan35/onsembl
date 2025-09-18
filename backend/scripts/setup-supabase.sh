#!/bin/bash

# Onsembl.ai Supabase Setup Script
# This script helps set up Supabase for local development

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Header
echo ""
echo "================================"
echo "Onsembl.ai Supabase Setup"
echo "================================"
echo ""

# Check prerequisites
print_info "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed"
    echo "Please install Node.js 20+ from https://nodejs.org"
    exit 1
fi
print_success "Node.js found: $(node --version)"

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    echo "Please install Docker from https://www.docker.com"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    print_error "Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi
print_success "Docker is running"

# Check Supabase CLI
if ! command -v supabase &> /dev/null; then
    print_warning "Supabase CLI not found"
    echo ""
    read -p "Would you like to install Supabase CLI? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Installing Supabase CLI..."

        # Detect OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            if command -v brew &> /dev/null; then
                brew install supabase/tap/supabase
            else
                print_error "Homebrew not found. Please install from https://brew.sh"
                exit 1
            fi
        else
            # Linux/WSL - try npm
            npm install -g supabase
        fi

        if ! command -v supabase &> /dev/null; then
            print_error "Failed to install Supabase CLI"
            echo "Please install manually from https://supabase.com/docs/guides/cli"
            exit 1
        fi
        print_success "Supabase CLI installed"
    else
        print_error "Supabase CLI is required"
        exit 1
    fi
else
    print_success "Supabase CLI found: $(supabase --version)"
fi

# Initialize Supabase if not already initialized
if [ ! -f "supabase/config.toml" ]; then
    print_info "Initializing Supabase project..."
    supabase init
    print_success "Supabase project initialized"
else
    print_success "Supabase project already initialized"
fi

# Check if Supabase is already running
if supabase status &> /dev/null; then
    print_warning "Supabase is already running"
    read -p "Would you like to restart it? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Stopping Supabase..."
        supabase stop
        print_info "Starting Supabase..."
        supabase start
    fi
else
    print_info "Starting Supabase (this may take a few minutes)..."
    supabase start
fi

# Get Supabase status
print_info "Getting Supabase connection details..."
SUPABASE_STATUS=$(supabase status --output json 2>/dev/null || echo "{}")

# Parse connection details
API_URL=$(echo $SUPABASE_STATUS | grep -o '"API URL":"[^"]*' | cut -d'"' -f4)
ANON_KEY=$(echo $SUPABASE_STATUS | grep -o '"anon key":"[^"]*' | cut -d'"' -f4)
SERVICE_KEY=$(echo $SUPABASE_STATUS | grep -o '"service_role key":"[^"]*' | cut -d'"' -f4)
DB_URL=$(echo $SUPABASE_STATUS | grep -o '"DB URL":"[^"]*' | cut -d'"' -f4)

# If JSON parsing failed, try text output
if [ -z "$API_URL" ]; then
    print_warning "Couldn't parse JSON, trying text output..."
    SUPABASE_STATUS_TEXT=$(supabase status 2>/dev/null)
    API_URL=$(echo "$SUPABASE_STATUS_TEXT" | grep "API URL" | awk '{print $3}')
    ANON_KEY=$(echo "$SUPABASE_STATUS_TEXT" | grep "anon key" | awk '{print $3}')
    SERVICE_KEY=$(echo "$SUPABASE_STATUS_TEXT" | grep "service_role key" | awk '{print $3}')
    DB_URL=$(echo "$SUPABASE_STATUS_TEXT" | grep "DB URL" | awk '{print $3}')
fi

# Default values if still not found
API_URL=${API_URL:-"http://localhost:54321"}
DB_URL=${DB_URL:-"postgresql://postgres:postgres@localhost:54322/postgres"}

print_success "Supabase is running!"
echo ""
print_info "Connection Details:"
echo "  API URL:    $API_URL"
echo "  Studio URL: http://localhost:54323"
if [ ! -z "$ANON_KEY" ]; then
    echo "  Anon Key:   ${ANON_KEY:0:20}..."
fi

# Create/Update .env file
print_info "Setting up environment variables..."

# Check if .env exists
if [ -f ".env" ]; then
    print_warning ".env file already exists"
    read -p "Would you like to update it with Supabase settings? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Skipping .env update"
    else
        # Backup existing .env
        cp .env .env.backup.$(date +%Y%m%d_%H%M%S)
        print_success "Backed up existing .env"

        # Update Supabase settings
        if [ ! -z "$API_URL" ]; then
            if grep -q "^SUPABASE_URL=" .env; then
                sed -i.tmp "s|^SUPABASE_URL=.*|SUPABASE_URL=$API_URL|" .env
            else
                echo "SUPABASE_URL=$API_URL" >> .env
            fi
        fi

        if [ ! -z "$ANON_KEY" ]; then
            if grep -q "^SUPABASE_ANON_KEY=" .env; then
                sed -i.tmp "s|^SUPABASE_ANON_KEY=.*|SUPABASE_ANON_KEY=$ANON_KEY|" .env
            else
                echo "SUPABASE_ANON_KEY=$ANON_KEY" >> .env
            fi
        fi

        if [ ! -z "$SERVICE_KEY" ]; then
            if grep -q "^SUPABASE_SERVICE_KEY=" .env; then
                sed -i.tmp "s|^SUPABASE_SERVICE_KEY=.*|SUPABASE_SERVICE_KEY=$SERVICE_KEY|" .env
            else
                echo "SUPABASE_SERVICE_KEY=$SERVICE_KEY" >> .env
            fi
        fi

        if [ ! -z "$DB_URL" ]; then
            if grep -q "^DATABASE_URL=" .env; then
                sed -i.tmp "s|^DATABASE_URL=.*|DATABASE_URL=$DB_URL|" .env
            else
                echo "DATABASE_URL=$DB_URL" >> .env
            fi
        fi

        # Clean up temp files
        rm -f .env.tmp
        print_success "Updated .env file"
    fi
else
    # Create new .env from template
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_success "Created .env from .env.example"
    else
        touch .env
        print_success "Created new .env file"
    fi

    # Add Supabase settings
    cat > .env << EOF
# Supabase Configuration (Local Development)
SUPABASE_URL=$API_URL
SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_KEY=$SERVICE_KEY
DATABASE_URL=$DB_URL

# Server Configuration
NODE_ENV=development
PORT=3010
HOST=0.0.0.0
LOG_LEVEL=debug

# Authentication
JWT_SECRET=$(openssl rand -base64 32)

# Redis (optional, for queues)
# REDIS_URL=redis://localhost:6379
EOF
    print_success "Configured .env with Supabase settings"
fi

# Run migrations if they exist
if [ -d "supabase/migrations" ] && [ "$(ls -A supabase/migrations)" ]; then
    print_info "Running database migrations..."
    supabase db push
    print_success "Migrations applied"
else
    print_info "No migrations to run"
fi

# Test database connection
print_info "Testing database connection..."
if curl -s -o /dev/null -w "%{http_code}" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    "$API_URL/rest/v1/" | grep -q "200"; then
    print_success "Database connection successful!"
else
    print_warning "Could not verify database connection"
    echo "This might be normal if tables haven't been created yet"
fi

# Install npm dependencies if needed
if [ ! -d "node_modules" ]; then
    print_info "Installing npm dependencies..."
    npm install
    print_success "Dependencies installed"
fi

# Summary
echo ""
echo "================================"
echo "Setup Complete!"
echo "================================"
echo ""
print_success "Supabase is ready for development"
echo ""
echo "Next steps:"
echo "  1. Review and adjust settings in .env"
echo "  2. Run the development server: npm run dev"
echo "  3. Access Supabase Studio: http://localhost:54323"
echo ""
echo "Useful commands:"
echo "  supabase status    - Check Supabase status"
echo "  supabase stop      - Stop Supabase"
echo "  supabase start     - Start Supabase"
echo "  supabase db reset  - Reset database (WARNING: deletes data)"
echo ""
print_info "Check docs/supabase-setup.md for more information"