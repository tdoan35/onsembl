#!/bin/bash

# Deployment script for Onsembl.ai
# Handles deployment to Fly.io (backend) and Vercel (frontend)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DEPLOY_BACKEND=false
DEPLOY_FRONTEND=false
DEPLOY_ALL=false
ENVIRONMENT="production"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if required tools are installed
check_requirements() {
    local missing_tools=()

    if ! command -v flyctl &> /dev/null; then
        missing_tools+=("flyctl")
    fi

    if ! command -v vercel &> /dev/null; then
        missing_tools+=("vercel")
    fi

    if ! command -v npm &> /dev/null; then
        missing_tools+=("npm")
    fi

    if [ ${#missing_tools[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_info "Please install missing tools:"
        [[ " ${missing_tools[@]} " =~ " flyctl " ]] && echo "  - flyctl: curl -L https://fly.io/install.sh | sh"
        [[ " ${missing_tools[@]} " =~ " vercel " ]] && echo "  - vercel: npm install -g vercel"
        [[ " ${missing_tools[@]} " =~ " npm " ]] && echo "  - npm: should be installed with Node.js"
        exit 1
    fi
}

# Function to deploy backend to Fly.io
deploy_backend() {
    print_info "Deploying backend to Fly.io..."

    # Build TypeScript
    print_info "Building backend..."
    cd backend
    npm run build
    cd ..

    # Deploy to Fly.io
    print_info "Deploying to Fly.io..."
    if [ "$ENVIRONMENT" == "staging" ]; then
        flyctl deploy --app onsembl-backend-staging --config fly.toml
    else
        flyctl deploy --app onsembl-backend --config fly.toml
    fi

    print_info "Backend deployment complete!"
}

# Function to deploy frontend to Vercel
deploy_frontend() {
    print_info "Deploying frontend to Vercel..."

    cd frontend

    if [ "$ENVIRONMENT" == "staging" ]; then
        print_info "Deploying to staging..."
        vercel --prod=false
    else
        print_info "Deploying to production..."
        vercel --prod
    fi

    cd ..

    print_info "Frontend deployment complete!"
}

# Function to run pre-deployment checks
run_checks() {
    print_info "Running pre-deployment checks..."

    # Run tests
    print_info "Running tests..."
    npm run test:ci || {
        print_error "Tests failed! Aborting deployment."
        exit 1
    }

    # Type checking
    print_info "Running type checks..."
    npm run type-check || {
        print_error "Type checking failed! Aborting deployment."
        exit 1
    }

    # Lint checking
    print_info "Running lint checks..."
    npm run lint || {
        print_error "Linting failed! Aborting deployment."
        exit 1
    }

    print_info "All checks passed!"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backend|-b)
            DEPLOY_BACKEND=true
            shift
            ;;
        --frontend|-f)
            DEPLOY_FRONTEND=true
            shift
            ;;
        --all|-a)
            DEPLOY_ALL=true
            shift
            ;;
        --staging|-s)
            ENVIRONMENT="staging"
            shift
            ;;
        --skip-checks)
            SKIP_CHECKS=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -b, --backend      Deploy only the backend"
            echo "  -f, --frontend     Deploy only the frontend"
            echo "  -a, --all          Deploy both backend and frontend"
            echo "  -s, --staging      Deploy to staging environment"
            echo "  --skip-checks      Skip pre-deployment checks"
            echo "  -h, --help         Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0 --all                    # Deploy everything to production"
            echo "  $0 --backend --staging       # Deploy backend to staging"
            echo "  $0 --frontend --skip-checks  # Deploy frontend without checks"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Set deploy all if no specific target is selected
if [ "$DEPLOY_ALL" = true ]; then
    DEPLOY_BACKEND=true
    DEPLOY_FRONTEND=true
fi

# Default to deploying all if nothing specified
if [ "$DEPLOY_BACKEND" = false ] && [ "$DEPLOY_FRONTEND" = false ]; then
    DEPLOY_BACKEND=true
    DEPLOY_FRONTEND=true
fi

# Main execution
print_info "Starting Onsembl.ai deployment to $ENVIRONMENT..."

# Check requirements
check_requirements

# Run checks unless skipped
if [ "$SKIP_CHECKS" != true ]; then
    run_checks
fi

# Deploy components
if [ "$DEPLOY_BACKEND" = true ]; then
    deploy_backend
fi

if [ "$DEPLOY_FRONTEND" = true ]; then
    deploy_frontend
fi

print_info "🚀 Deployment complete!"
print_info "Environment: $ENVIRONMENT"
[ "$DEPLOY_BACKEND" = true ] && print_info "✅ Backend deployed"
[ "$DEPLOY_FRONTEND" = true ] && print_info "✅ Frontend deployed"