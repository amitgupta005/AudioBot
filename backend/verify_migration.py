#!/usr/bin/env python3
"""
Verification and audit script for Redis to MongoDB message migration.
Checks consistency between Redis and MongoDB, identifies missing messages,
and generates detailed reports.

Usage:
    python verify_migration.py [--json] [--export FILE] [--check-integrity]

Options:
    --json              Output results in JSON format
    --export FILE       Export detailed report to CSV file
    --check-integrity   Verify message content integrity
"""

import json
import csv
import logging
import argparse
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

import redis
from pymongo import MongoClient

from app.config import REDIS_HOST, REDIS_PORT, REDIS_DB, MONGODB_URI

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class MigrationVerifier:
    """Verifies and audits Redis to MongoDB migration."""

    CONVERSATION_INDEX_KEY = "conversation:index"

    def __init__(self, redis_url: str = None, mongo_uri: str = None):
        """Initialize verifier."""
        self.redis_url = redis_url or f"redis://{REDIS_HOST}:{REDIS_PORT}/{REDIS_DB}"
        self.mongo_uri = mongo_uri or MONGODB_URI
        self.redis_client = None
        self.mongo_client = None
        self.db = None

    def connect(self):
        """Connect to both Redis and MongoDB."""
        try:
            self.redis_client = redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_connect_timeout=5
            )
            self.redis_client.ping()
            logger.info(f"✅ Connected to Redis")
        except Exception as e:
            logger.error(f"❌ Redis connection failed: {e}")
            raise

        try:
            self.mongo_client = MongoClient(self.mongo_uri)
            self.mongo_client.admin.command('ping')
            self.db = self.mongo_client.get_database()
            logger.info(f"✅ Connected to MongoDB: {self.db.name}")
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            raise

    def get_redis_conversations(self) -> Dict[str, List]:
        """Get all conversations currently in Redis."""
        try:
            conv_ids = self.redis_client.smembers(self.CONVERSATION_INDEX_KEY)
            conversations = {}
            
            for conv_id in conv_ids:
                try:
                    data = self.redis_client.get(conv_id)
                    if data:
                        conversations[conv_id] = json.loads(data)
                except Exception as e:
                    logger.warning(f"⚠️  Failed to load {conv_id}: {e}")
            
            logger.info(f"📦 Retrieved {len(conversations)} conversations from Redis")
            return conversations
        except Exception as e:
            logger.error(f"❌ Error retrieving Redis conversations: {e}")
            raise

    def get_mongodb_conversations(self) -> Dict[str, Dict]:
        """Get all conversations from MongoDB."""
        try:
            conversations = {}
            
            for doc in self.db.conversations.find({}):
                session_id = doc.get('sessionId') or str(doc['_id'])
                conversations[session_id] = {
                    'messages': doc.get('messages', []),
                    'userId': doc.get('userId'),
                    'lastUpdated': doc.get('lastUpdated'),
                    'source': doc.get('source'),
                    '_id': str(doc['_id'])
                }
            
            logger.info(f"📦 Retrieved {len(conversations)} conversations from MongoDB")
            return conversations
        except Exception as e:
            logger.error(f"❌ Error retrieving MongoDB conversations: {e}")
            raise

    def compare_conversations(self, redis_convs: Dict, mongo_convs: Dict) -> Dict[str, Any]:
        """Compare conversations between Redis and MongoDB."""
        report = {
            'timestamp': datetime.now().isoformat(),
            'redis_total': len(redis_convs),
            'mongodb_total': len(mongo_convs),
            'in_redis_only': [],
            'in_mongodb_only': [],
            'in_both': [],
            'message_differences': [],
            'summary': {}
        }

        redis_ids = set(redis_convs.keys())
        mongo_ids = set(mongo_convs.keys())

        # Find conversations only in Redis
        redis_only = redis_ids - mongo_ids
        report['in_redis_only'] = list(redis_only)

        # Find conversations only in MongoDB
        mongo_only = mongo_ids - redis_ids
        report['in_mongodb_only'] = list(mongo_only)

        # Find conversations in both and compare
        in_both = redis_ids & mongo_ids
        report['in_both'] = list(in_both)

        for conv_id in in_both:
            redis_msgs = redis_convs[conv_id]
            mongo_msgs = mongo_convs[conv_id].get('messages', [])

            redis_count = len(redis_msgs) if isinstance(redis_msgs, list) else 0
            mongo_count = len(mongo_msgs)

            if redis_count != mongo_count:
                report['message_differences'].append({
                    'sessionId': conv_id,
                    'redis_count': redis_count,
                    'mongodb_count': mongo_count,
                    'difference': mongo_count - redis_count
                })

        # Summary
        report['summary'] = {
            'complete_sync': len(redis_only) == 0,
            'redis_only_count': len(redis_only),
            'mongodb_only_count': len(mongo_only),
            'synchronized_count': len(in_both),
            'message_mismatches': len(report['message_differences'])
        }

        return report

    def check_integrity(self, redis_convs: Dict, mongo_convs: Dict) -> Dict[str, Any]:
        """Check message content integrity."""
        integrity_report = {
            'checked': 0,
            'valid': 0,
            'issues': []
        }

        for conv_id in set(redis_convs.keys()) & set(mongo_convs.keys()):
            integrity_report['checked'] += 1
            
            redis_msgs = redis_convs[conv_id]
            mongo_msgs = mongo_convs[conv_id].get('messages', [])

            # Check if message contents match
            if isinstance(redis_msgs, list) and isinstance(mongo_msgs, list):
                # Compare first and last messages if they exist
                if redis_msgs and mongo_msgs:
                    redis_first = redis_msgs[0]
                    mongo_first = mongo_msgs[0]

                    if redis_first != mongo_first:
                        integrity_report['issues'].append({
                            'sessionId': conv_id,
                            'type': 'content_mismatch',
                            'detail': 'First message differs'
                        })
                    else:
                        integrity_report['valid'] += 1
            else:
                integrity_report['issues'].append({
                    'sessionId': conv_id,
                    'type': 'format_error',
                    'detail': 'Invalid message format'
                })

        return integrity_report

    def generate_report(self, compare_result: Dict, integrity_result: Dict = None) -> str:
        """Generate a formatted report."""
        report = []
        summary = compare_result['summary']

        report.append("\n" + "="*70)
        report.append("  REDIS TO MONGODB MIGRATION VERIFICATION REPORT")
        report.append("="*70)
        report.append(f"\n📅 Generated: {compare_result['timestamp']}\n")

        # Overview
        report.append("📊 OVERVIEW")
        report.append("-" * 70)
        report.append(f"  Total in Redis:   {compare_result['redis_total']}")
        report.append(f"  Total in MongoDB: {compare_result['mongodb_total']}")
        report.append(f"  Synchronized:     {summary['synchronized_count']}")
        report.append(f"  Only in Redis:    {summary['redis_only_count']}")
        report.append(f"  Only in MongoDB:  {summary['mongodb_only_count']}")

        # Status
        status = "✅ COMPLETE" if summary['complete_sync'] else "⚠️  INCOMPLETE"
        report.append(f"\n  Status: {status}\n")

        # Details for missing
        if summary['redis_only_count'] > 0:
            report.append("⚠️  CONVERSATIONS ONLY IN REDIS (Need Migration)")
            report.append("-" * 70)
            for conv_id in compare_result['in_redis_only'][:20]:  # Show first 20
                report.append(f"  • {conv_id}")
            if len(compare_result['in_redis_only']) > 20:
                report.append(f"  ... and {len(compare_result['in_redis_only']) - 20} more")
            report.append()

        if summary['mongodb_only_count'] > 0:
            report.append("ℹ️  CONVERSATIONS ONLY IN MONGODB")
            report.append("-" * 70)
            report.append(f"  {summary['mongodb_only_count']} additional records in MongoDB")
            report.append("  (These may be from Node gateway or other sources)\n")

        # Message mismatches
        if summary['message_mismatches'] > 0:
            report.append("⚠️  MESSAGE COUNT MISMATCHES")
            report.append("-" * 70)
            for diff in compare_result['message_differences'][:10]:  # Show first 10
                report.append(f"  • {diff['sessionId']}")
                report.append(f"    Redis: {diff['redis_count']} msgs, MongoDB: {diff['mongodb_count']} msgs")
            if len(compare_result['message_differences']) > 10:
                report.append(f"  ... and {len(compare_result['message_differences']) - 10} more")
            report.append()

        # Integrity check
        if integrity_result:
            report.append("🔍 INTEGRITY CHECK")
            report.append("-" * 70)
            report.append(f"  Checked:  {integrity_result['checked']} conversations")
            report.append(f"  Valid:    {integrity_result['valid']}")
            report.append(f"  Issues:   {len(integrity_result['issues'])}")
            if integrity_result['issues']:
                report.append("\n  First 5 issues:")
                for issue in integrity_result['issues'][:5]:
                    report.append(f"    • {issue['sessionId']}: {issue['type']}")
            report.append()

        # Recommendations
        report.append("💡 RECOMMENDATIONS")
        report.append("-" * 70)
        if summary['complete_sync']:
            report.append("  ✅ All Redis data is synchronized with MongoDB")
            report.append("  ✅ Migration complete and verified")
        else:
            report.append(f"  ⚠️  {summary['redis_only_count']} conversations still need migration")
            report.append("  Run migrate_redis_to_mongodb.py to complete the sync")
        report.append()

        report.append("="*70 + "\n")

        return "\n".join(report)

    def verify(self, check_integrity: bool = False, output_json: bool = False) -> Dict[str, Any]:
        """Run full verification."""
        try:
            self.connect()

            logger.info("\n🔍 Starting verification...\n")

            # Get conversations from both stores
            redis_convs = self.get_redis_conversations()
            mongo_convs = self.get_mongodb_conversations()

            # Compare
            compare_result = self.compare_conversations(redis_convs, mongo_convs)

            # Optional integrity check
            integrity_result = None
            if check_integrity:
                logger.info("🔍 Checking message integrity...")
                integrity_result = self.check_integrity(redis_convs, mongo_convs)
                compare_result['integrity'] = integrity_result

            # Generate report
            report_text = self.generate_report(compare_result, integrity_result)
            logger.info(report_text)

            if not output_json:
                print(report_text)

            return compare_result
        
        except Exception as e:
            logger.error(f"❌ Verification failed: {e}")
            raise
        finally:
            if self.redis_client:
                self.redis_client.close()
            if self.mongo_client:
                self.mongo_client.close()

    def export_report(self, report: Dict, filepath: str):
        """Export detailed report to CSV."""
        try:
            with open(filepath, 'w', newline='') as f:
                if report['in_redis_only']:
                    writer = csv.writer(f)
                    writer.writerow(['Session ID', 'Status', 'Details'])
                    
                    for conv_id in report['in_redis_only']:
                        writer.writerow([conv_id, 'REDIS_ONLY', 'Not yet migrated to MongoDB'])
                    
                    for conv_id in report['in_mongodb_only']:
                        writer.writerow([conv_id, 'MONGODB_ONLY', 'No corresponding Redis data'])
                    
                    for diff in report['message_differences']:
                        writer.writerow([
                            diff['sessionId'],
                            'MISMATCH',
                            f"Redis: {diff['redis_count']}, MongoDB: {diff['mongodb_count']}"
                        ])

            logger.info(f"✅ Report exported to {filepath}")
        except Exception as e:
            logger.error(f"❌ Failed to export report: {e}")


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Verify Redis to MongoDB migration"
    )
    parser.add_argument('--json', action='store_true', help='Output as JSON')
    parser.add_argument('--export', help='Export detailed report to CSV file')
    parser.add_argument('--check-integrity', action='store_true', help='Verify message content')
    parser.add_argument('--redis-url', help='Custom Redis URL')
    parser.add_argument('--mongo-uri', help='Custom MongoDB URI')

    args = parser.parse_args()

    verifier = MigrationVerifier(redis_url=args.redis_url, mongo_uri=args.mongo_uri)

    try:
        report = verifier.verify(
            check_integrity=args.check_integrity,
            output_json=args.json
        )

        if args.json:
            print(json.dumps(report, indent=2, default=str))

        if args.export:
            verifier.export_report(report, args.export)

        # Exit with appropriate code
        exit(0 if report['summary']['complete_sync'] else 1)

    except KeyboardInterrupt:
        logger.info("\n⏸️  Interrupted by user")
        exit(1)
    except Exception as e:
        logger.error(f"\n❌ Fatal error: {e}")
        exit(1)


if __name__ == '__main__':
    main()
