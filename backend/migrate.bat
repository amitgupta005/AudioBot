@echo off
REM Redis to MongoDB Message Migration Script (Windows)
REM This batch script provides easy access to migration and verification commands

setlocal enabledelayedexpansion

cd /d "%~dp0backend"

if "%1"=="" (
    echo.
    echo ======================================================================
    echo   Redis to MongoDB Message Migration
    echo ======================================================================
    echo.
    echo Usage:
    echo   migrate.bat [command] [options]
    echo.
    echo Commands:
    echo   migrate         Run the migration (migrates all Redis messages to MongoDB^)
    echo   migrate-dry     Preview migration without making changes (SAFE^)
    echo   verify          Check migration status and consistency
    echo   verify-full     Verify with integrity checks
    echo   export FILE     Export verification report to CSV
    echo   stats           Show Redis and MongoDB statistics
    echo   help            Show this help message
    echo.
    echo Examples:
    echo   migrate.bat migrate-dry              (^! Run this first to preview^)
    echo   migrate.bat migrate                  (Run actual migration^)
    echo   migrate.bat verify                   (Check success^)
    echo   migrate.bat export report.csv        (Export detailed report^)
    echo.
    echo ======================================================================
    echo.
    goto :end
)

if /i "%1"=="migrate-dry" (
    echo.
    echo 🧪 Running migration in DRY-RUN mode (no changes will be made^)...
    echo.
    python migrate_redis_to_mongodb.py --dry-run
    goto :end
)

if /i "%1"=="migrate" (
    echo.
    echo 🚀 Starting migration...
    echo.
    python migrate_redis_to_mongodb.py
    goto :end
)

if /i "%1"=="verify" (
    echo.
    echo 🔍 Verifying migration status...
    echo.
    python verify_migration.py
    goto :end
)

if /i "%1"=="verify-full" (
    echo.
    echo 🔍 Verifying with integrity checks...
    echo.
    python verify_migration.py --check-integrity
    goto :end
)

if /i "%1"=="export" (
    if "%2"=="" (
        echo ❌ Please specify export file: migrate.bat export report.csv
        goto :end
    )
    echo.
    echo 📊 Exporting verification report to %2...
    echo.
    python verify_migration.py --export %2
    goto :end
)

if /i "%1"=="stats" (
    echo.
    echo 📊 Getting migration statistics...
    echo.
    python -c "from app.memory.store import MemoryStore; store = MemoryStore(); import json; print(json.dumps(store.get_stats(), indent=2))"
    goto :end
)

if /i "%1"=="help" (
    call :help
    goto :end
)

echo ❌ Unknown command: %1
echo Run 'migrate.bat help' for usage information
goto :end

:help
echo.
echo ======================================================================
echo   Redis to MongoDB Message Migration Helper
echo ======================================================================
echo.
echo This batch script helps manage the migration of messages from Redis to MongoDB.
echo.
echo QUICK START:
echo   1. migrate.bat migrate-dry      ^(Preview what will be migrated^)
echo   2. migrate.bat migrate           ^(Run the actual migration^)
echo   3. migrate.bat verify            ^(Check if migration was successful^)
echo.
echo DETAILED COMMANDS:
echo.
echo   migrate-dry
echo     - Preview migration without making any changes
echo     - Safe to run multiple times
echo     - Recommended to run before 'migrate'
echo.
echo   migrate
echo     - Perform actual migration from Redis to MongoDB
echo     - Automatically verifies results
echo     - Safe to run multiple times (uses upsert^)
echo.
echo   verify
echo     - Check consistency between Redis and MongoDB
echo     - Shows which conversations are synced
echo     - Shows any missing data
echo.
echo   verify-full
echo     - Complete verification including message content integrity
echo     - Slower but more thorough
echo     - Recommended after migration
echo.
echo   export ^<FILE^>
echo     - Export verification results to CSV file
echo     - Useful for audits and reporting
echo     - Example: migrate.bat export results.csv
echo.
echo   stats
echo     - Show current migration statistics
echo     - Displays counts in Redis and MongoDB
echo.
echo ENVIRONMENT:
echo   Ensure these environment variables are set:
echo     - MONGODB_URI (MongoDB connection string^)
echo     - REDIS_URL or REDIS_HOST, REDIS_PORT, REDIS_DB
echo.
echo For more details, see MIGRATION_GUIDE.md
echo ======================================================================
echo.
goto :end

:end
endlocal
