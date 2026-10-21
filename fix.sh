#!/bin/bash
cd /root/projeto/praxis
cat > /tmp/fix.css << 'CSS'
@media (max-width: 1080px) {
  .sidebar {
    position: static;
    height: auto;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    border-right: none;
    border-bottom: 1px solid var(--sidebar-border);
    padding: 12px 16px;
    gap: 10px;
  }

  .nav {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 4px;
    padding: 2px;
  }

  .nav a {
    padding: 6px 10px;
    font-size: 0.95rem;
  }

  .nav-section {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }

  .nav-label {
    display: none;
  }

  .user-box {
    margin-top: 0;
    padding: 6px 10px;
  }

  .content {
    padding: clamp(14px, 4vw, 24px);
  }

  .app {
    display: flex;
    flex-direction: column;
  }

  .screen {
    width: 100%;
    overflow-x: hidden;
  }

  .card {
    width: 100%;
    min-width: 0;
  }

  .cards,
  .row,
  .controls,
  .pricing,
  .card-grid,
  .steps {
    width: 100%;
    min-width: 0;
  }

  input,
  select,
  textarea {
    max-width: 100%;
  }
}
CSS
python3 -c "
import sys
# append
pass
"
echo 'ok'
