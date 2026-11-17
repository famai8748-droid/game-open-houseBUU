// The QR codes must point at the real Wi-Fi/LAN address, never a virtual adapter.
const test = require('node:test');
const assert = require('node:assert/strict');
const { getLocalLanIp, listLanCandidates } = require('../server/lan-ip');

const v4 = (address, internal = false) => ({ family: 'IPv4', address, internal });

test('skips WSL/Hyper-V and VirtualBox adapters listed before the Wi-Fi', () => {
  const nets = {
    'vEthernet (WSL)': [v4('172.24.160.1')],
    'VirtualBox Host-Only Network': [v4('192.168.56.1')],
    'Wi-Fi': [v4('10.106.75.109')],
    'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)]
  };
  assert.equal(getLocalLanIp(nets), '10.106.75.109');
  assert.equal(listLanCandidates(nets)[0].virtual, false);
});

test('ignores self-assigned addresses and falls back to localhost', () => {
  assert.equal(getLocalLanIp({ Ethernet: [v4('169.254.10.2')] }), 'localhost');
  assert.equal(getLocalLanIp({}), 'localhost');
});

test('a virtual adapter is still used when it is the only one', () => {
  const only = listLanCandidates({ 'vEthernet (Default Switch)': [v4('172.17.0.1')] });
  assert.equal(only[0].address, '172.17.0.1');
  assert.equal(only[0].virtual, true);
});
