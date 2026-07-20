#!/bin/bash
# Double-clic pour lancer Static Meter dans Chrome
cd "$(dirname "$0")"

echo ""
echo "  ▶  Static Meter — mode Chrome"
echo ""

# Libérer le port si occupé
PIDS=$(lsof -ti tcp:7893 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "  ✓ Libération port 7893 (PIDs: $PIDS)"
  echo "$PIDS" | xargs kill -9 2>/dev/null
  sleep 0.5
fi

# Démarrer le serveur en arrière-plan
node server.cjs &
SERVER_PID=$!
echo "  ✓ Serveur démarré (PID $SERVER_PID)"
sleep 1.5

# Ouvrir Chrome
open -a "Google Chrome" "http://127.0.0.1:7893"
echo "  ✓ Chrome ouvert sur http://127.0.0.1:7893"
echo ""
echo "  Appuie sur Ctrl+C pour arrêter le serveur."
echo ""

# Attendre la fin
wait $SERVER_PID
