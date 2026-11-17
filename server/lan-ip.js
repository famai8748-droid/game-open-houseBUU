// Picks the address phones should use to reach this laptop.
// The first non-internal IPv4 is often a virtual adapter on Windows (WSL / Hyper-V "vEthernet",
// VirtualBox, VMware, a VPN), and a QR pointing there can never load on a phone.
const os = require('os');

const VIRTUAL = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|bluetooth|tailscale|zerotier|vpn|tap-|tun/i;

function rankAddress(name, address) {
  if (/^169\.254\./.test(address)) return -1; // no DHCP lease (self-assigned)
  let score = VIRTUAL.test(name) ? 0 : 10;
  if (/wi-?fi|wlan|wireless/i.test(name)) score += 3;
  else if (/ethernet|eth|en\d/i.test(name)) score += 2;
  if (/^192\.168\./.test(address)) score += 2;
  else if (/^10\./.test(address)) score += 2;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(address)) score += 1; // also what Hyper-V/WSL hand out
  return score;
}

function listLanCandidates(nets = os.networkInterfaces()) {
  const out = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      const score = rankAddress(name, net.address);
      if (score >= 0) out.push({ name, address: net.address, score, virtual: VIRTUAL.test(name) });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

function getLocalLanIp(nets) {
  const best = listLanCandidates(nets)[0];
  return best ? best.address : 'localhost';
}

module.exports = { getLocalLanIp, listLanCandidates };
