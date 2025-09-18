#!/bin/bash

# Docker development script for Onsembl.ai
# Manages local development environment with Docker Compose

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

print_debug() {
    echo -e "${BLUE}[DEBUG]${NC} $1"
}

# Function to check Docker installation
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed!"
        echo "Please install Docker from: https://docs.docker.com/get-docker/"
        exit 1
    fi

    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed!"
        echo "Please install Docker Compose from: https://docs.docker.com/compose/install/"
        exit 1
    fi

    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running!"
        echo "Please start Docker Desktop or the Docker service."
        exit 1
    fi
}

# Function to create .env file if it doesn't exist
setup_env() {
    if [ ! -f .env ]; then
        print_info "Creating .env file from template..."
        cat > .env << 'EOF'
# Onsembl Development Environment Variables

# Database
DATABASE_URL=postgresql://onsembl:onsembl_dev_password@localhost:5432/onsembl_db

# Redis
REDIS_URL=redis://localhost:6379

# Supabase (optional - for production mode testing)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key

# JWT
JWT_SECRET=development-secret-change-in-production

# Backend
BACKEND_PORT=8080
CORS_ORIGIN=http://localhost:3000

# Frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080/ws
EOF
        print_info ".env file created. Please update with your actual values if needed."
    fi
}

# Function to start services
start_services() {
    print_info "Starting Docker Compose services..."

    if docker compose version &> /dev/null; then
        docker compose up -d "$@"
    else
        docker-compose up -d "$@"
    fi

    print_info "Services started!"
    print_info "Frontend: http://localhost:3000"
    print_info "Backend: http://localhost:8080"
    print_info "PostgreSQL: localhost:5432"
    print_info "Redis: localhost:6379"
}

# Function to stop services
stop_services() {
    print_info "Stopping Docker Compose services..."

    if docker compose version &> /dev/null; then
        docker compose down
    else
        docker-compose down
    fi

    print_info "Services stopped!"
}

# Function to restart services
restart_services() {
    stop_services
    start_services "$@"
}

# Function to view logs
view_logs() {
    if docker compose version &> /dev/null; then
        docker compose logs -f "$@"
    else
        docker-compose logs -f "$@"
    fi
}

# Function to rebuild images
rebuild_images() {
    print_info "Rebuilding Docker images..."

    if docker compose version &> /dev/null; then
        docker compose build --no-cache "$@"
    else
        docker-compose build --no-cache "$@"
    fi

    print_info "Images rebuilt!"
}

# Function to clean up everything
cleanup() {
    print_warn "This will remove all containers, volumes, and images for this project."
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cleaning up..."

        if docker compose version &> /dev/null; then
            docker compose down -v --rmi all
        else
            docker-compose down -v --rmi all
        fi

        print_info "Cleanup complete!"
    else
        print_info "Cleanup cancelled."
    fi
}

# Function to run database migrations
run_migrations() {
    print_info "Running database migrations..."

    if docker compose version &> /dev/null; then
        docker compose exec backend npm run migrate
    else
        docker-compose exec backend npm run migrate
    fi

    print_info "Migrations complete!"
}

# Function to show status
show_status() {
    print_info "Service Status:"

    if docker compose version &> /dev/null; then
        docker compose ps
    else
        docker-compose ps
    fi
}

# Function to execute command in container
exec_in_container() {
    local service=$1
    shift

    if docker compose version &> /dev/null; then
        docker compose exec "$service" "$@"
    else
        docker-compose exec "$service" "$@"
    fi
}

# Main command processing
case "${1:-}" in
    start)
        shift
        check_docker
        setup_env
        start_services "$@"
        ;;
    stop)
        check_docker
        stop_services
        ;;
    restart)
        shift
        check_docker
        restart_services "$@"
        ;;
    logs)
        shift
        check_docker
        view_logs "$@"
        ;;
    build)
        shift
        check_docker
        rebuild_images "$@"
        ;;
    clean)
        check_docker
        cleanup
        ;;
    status)
        check_docker
        show_status
        ;;
    migrate)
        check_docker
        run_migrations
        ;;
    exec)
        shift
        check_docker
        exec_in_container "$@"
        ;;
    backend)
        shift
        check_docker
        exec_in_container backend "$@"
        ;;
    frontend)
        shift
        check_docker
        exec_in_container frontend "$@"
        ;;
    help|--help|-h|"")
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Commands:"
        echo "  start [services]   Start all or specific services"
        echo "  stop               Stop all services"
        echo "  restart [services] Restart all or specific services"
        echo "  logs [services]    View logs (follows by default)"
        echo "  build [services]   Rebuild Docker images"
        echo "  clean              Remove all containers, volumes, and images"
        echo "  status             Show service status"
        echo "  migrate            Run database migrations"
        echo "  exec <service>     Execute command in a service container"
        echo "  backend <cmd>      Execute command in backend container"
        echo "  frontend <cmd>     Execute command in frontend container"
        echo "  help               Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 start                  # Start all services"
        echo "  $0 start backend redis    # Start only backend and redis"
        echo "  $0 logs backend          # View backend logs"
        echo "  $0 backend npm test      # Run tests in backend"
        echo "  $0 exec postgres psql    # Access PostgreSQL CLI"
        ;;
    *)
        print_error "Unknown command: $1"
        echo "Use '$0 help' for usage information"
        exit 1
        ;;
esac