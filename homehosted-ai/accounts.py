"""Manage local accounts: python3 accounts.py USERNAME"""
import getpass
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys

DB = Path(os.environ.get('FRS_AI_DB', Path(__file__).with_name('accounts.sqlite3')))


def password_hash(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)


def initialize():
    with sqlite3.connect(DB) as db:
        db.execute('CREATE TABLE IF NOT EXISTS users (name TEXT PRIMARY KEY, salt BLOB, digest BLOB)')
        db.execute('CREATE TABLE IF NOT EXISTS keys (digest TEXT PRIMARY KEY, owner TEXT)')
        db.execute('CREATE TABLE IF NOT EXISTS double_sweeps (owner TEXT PRIMARY KEY, routine TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS sweep_examples (owner TEXT, signature TEXT, routine TEXT NOT NULL, PRIMARY KEY(owner, signature))')
        for owner, routine in db.execute('SELECT owner,routine FROM double_sweeps WHERE owner NOT IN (SELECT owner FROM sweep_examples)'):
            _store_example(db, owner, routine)


def issue(name, password):
    with sqlite3.connect(DB) as db:
        row = db.execute('SELECT salt,digest FROM users WHERE name=?', (name,)).fetchone()
        if not row or not secrets.compare_digest(password_hash(password, row[0]), row[1]):
            return None
        key = secrets.token_urlsafe(32)
        db.execute('INSERT INTO keys VALUES (?,?)', (hashlib.sha256(key.encode()).hexdigest(), name))
        return key


def key_owner(key):
    with sqlite3.connect(DB) as db:
        row = db.execute('SELECT owner FROM keys WHERE digest=?', (hashlib.sha256(key.encode()).hexdigest(),)).fetchone()
        return row[0] if row else None


def _store_example(db, owner, routine):
    data = json.loads(routine)
    # Repeated clicks and copies with fresh IDs represent the same driving example.
    behavior = {key: [{k: v for k, v in item.items() if k != 'id'} for item in data[key]]
                for key in ('waypoints', 'actions')}
    behavior['constraints'] = data.get('constraints')
    signature = hashlib.sha256(json.dumps(behavior, sort_keys=True).encode()).hexdigest()
    db.execute('INSERT OR REPLACE INTO sweep_examples VALUES (?,?,?)', (owner, signature, routine))


def save_double_sweep(owner, routine):
    with sqlite3.connect(DB) as db:
        _store_example(db, owner, routine)
        return db.execute('SELECT COUNT(*) FROM sweep_examples WHERE owner=?', (owner,)).fetchone()[0]


def sweep_examples(owner):
    with sqlite3.connect(DB) as db:
        for row in db.execute('SELECT routine FROM sweep_examples WHERE owner=? ORDER BY rowid DESC', (owner,)):
            yield json.loads(row[0])


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Usage: python3 accounts.py USERNAME')
    password = getpass.getpass('New password: ')
    if not password or password != getpass.getpass('Confirm password: '):
        sys.exit('Passwords must match and be nonempty.')
    initialize()
    salt = secrets.token_bytes(16)
    with sqlite3.connect(DB) as db:
        db.execute('INSERT OR REPLACE INTO users VALUES (?,?,?)', (sys.argv[1], salt, password_hash(password, salt)))
        db.execute('DELETE FROM keys WHERE owner=?', (sys.argv[1],))
    print('Account saved. Previous keys for this user have been revoked.')
