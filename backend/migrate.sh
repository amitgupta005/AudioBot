#!/bin/bash
# Redis to MongoDB Message Migration Script (Linux/macOS)
# This script provides easy access to migration and verification commands

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

function show_help() {
    cat << EOF

${BLUE}======================================================================${NC}
  Redis to MongoDB Message Migration
${BLUE}======================================================================${NC}

${GREEN}Usage:${NC}
  ./migrate.sh [command] [options]

${GREEN}Commands:${NC}
  migrate         ${NC}Run the migration (migrates all Redis messages to MongoDB)
  migrate-dry     ${NC}Preview migration without making changes (SAFE)
  verify          ${NC}Check migration status and consistency
  verify-full     ${NC}Verify with integrity checks
  export FILE     ${NC}Export verification report to CSV
  stats           ${NC}Show Redis and MongoDB statistics
  help            ${NC}Show this help message

${GREEN}Examples:${NC}
  ./migrate.sh migrate-dry              (! Run this first to preview)
  ./migrate.sh migrate                  (Run actual migration)
  ./migrate.sh verify                   (Check success)
  ./migrate.sh export report.csv        (Export detailed report)

${BLUE}======================================================================${NC}

EOF
}

function show_detailed_help() {
    cat << EOF

${BLUE}======================================================================${NC}
  Redis to MongoDB Message Migration Helper
${BLUE}======================================================================${NC}

${GREEN}This script helps manage the migration of messages from Redis to MongoDB.${NC}

${YELLOW}QUICK START:${NC}
  1. ./migrate.sh migrate-dry      (Preview what will be migrated)
  2. ./migrate.sh migrate           (Run the actual migration)
  3. ./migrate.sh verify            (Check if migration was successful)

${YELLOW}DETAILED COMMANDS:${NC}

  ${GREEN}migrate-dry${NC}
    - Preview migration without making any changes
    - Safe to run multiple times
    - Recommended to run before 'migrate'

  ${GREEN}migrate${NC}
    - Perform actual migration from Redis to MongoDB
    - Automatically verifies results
    - Safe to run multiple times (uses upsert)

  ${GREEN}verify${NC}
    - Check consistency between Redis and MongoDB
    - Shows which conversations are synced
    - Shows any missing data

  ${GREEN}verify-full${NC}
    - Complete verification including message content integrity
    - Slower but more thorough
    - Recommended after migration

  ${GREEN}export <FILE>${NC}
    - Export verification results to CSV file
    - Useful for audits and reporting
    - Example: ./migrate.sh export results.csv

  ${GREEN}stats${NC}
    - Show current migration statistics
    - Displays counts in Redis and MongoDB

${YELLOW}ENVIRONMENT:${NC}
  Ensure these environment variables are set:
    - MONGODB_URI (MongoDB connection string)
    - REDIS_URL or REDIS_HOST, REDIS_PORT, REDIS_DB

${YELLOW}For more details, see MIGRATION_GUIDE.md${NC}

${BLUE}======================================================================${NC}

EOF
}

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is not installed or not in PATH${NC}"
    exit 1
fi

case "$1" in
    migrate-dry)
        echo ""
        echo -e "${YELLOW}🧪 Running migration in DRY-RUN mode (no changes will be made)...${NC}"
        echo ""
        python3 migrate_redis_to_mongodb.py --dry-run
        ;;
    migrate)
        echo ""
        echo -e "${YELLOW}🚀 Starting migration...${NC}"
        echo ""
        python3 migrate_redis_to_mongodb.py
        ;;
    verify)
        echo ""
        echo -e "${YELLOW}🔍 Verifying migration status...${NC}"
        echo ""
        python3 verify_migration.py
        ;;
    verify-full)
        echo ""
        echo -e "${YELLOW}🔍 Verifying with integrity checks...${NC}"
        echo ""
        python3 verify_migration.py --check-integrity
        ;;
    export)
        if [ -z "$2" ]; then
            echo -e "${RED}❌ Please specify export file: ./migrate.sh export report.csv${NC}"
            exit 1
        fi
        echo ""
        echo -e "${YELLOW}📊 Exporting verification report to $2...${NC}"
        echo ""
        python3 verify_migration.py --export "$2"
        ;;
    stats)
        echo ""
        echo -e "${YELLOW}📊 Getting migration statistics...${NC}"
        echo ""
        python3 -c "from app.memory.store import MemoryStore; store = MemoryStore(); import json; print(json.dumps(store.get_stats(), indent=2))"
        ;;
    help|--help|-h)
        show_detailed_help
        ;;
    "")
        show_help
        ;;
    *)
        echo -e "${RED}❌ Unknown command: $1${NC}"
        echo "Run './migrate.sh help' for usage information"
        exit 1
        ;;
esac
