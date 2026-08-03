
const axios = require('axios');

/**
 * Detect VPN/Proxy usage using multiple detection services
 * @param {string} ip - IP address to check
 * @returns {Promise<{isVpn: boolean, provider: string, confidence: number}>}
 */
async function detectVPN(ip) {
  // Skip localhost/private IPs
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { isVpn: false, provider: null, confidence: 0 };
  }

  try {
    // Primary: IPHub (free tier: 1000 requests/day)
    // Skip if no API key configured
    if (process.env.IPHUB_API_KEY && process.env.IPHUB_API_KEY !== 'test') {
      const iphubResponse = await axios.get(`http://v2.api.iphub.info/ip/${ip}`, {
        headers: { 'X-Key': process.env.IPHUB_API_KEY },
        timeout: 5000
      });

      const block = iphubResponse.data.block;
      // block: 0 = residential, 1 = vpn/proxy, 2 = datacenter
      if (block === 1 || block === 2) {
        return {
          isVpn: true,
          provider: iphubResponse.data.isp || 'Unknown VPN/Proxy',
          confidence: 90,
          service: 'iphub'
        };
      }
    } else {
      console.log(' IPHub API key not configured, skipping...');
    }
  } catch (err) {
    console.log(' IPHub check failed:', err.message);
  }

  try {
    // Fallback: IPQualityScore (free tier available)
    if (process.env.IPQS_API_KEY && process.env.IPQS_API_KEY !== 'demo') {
      const ipqsResponse = await axios.get(`https://ipqualityscore.com/api/json/ip/${process.env.IPQS_API_KEY}/${ip}`, {
        timeout: 5000
      });

      if (ipqsResponse.data.proxy || ipqsResponse.data.vpn || ipqsResponse.data.tor) {
        return {
          isVpn: true,
          provider: ipqsResponse.data.ISP || 'VPN/Proxy detected',
          confidence: ipqsResponse.data.fraud_score || 80,
          service: 'ipqualityscore'
        };
      }
    } else {
      console.log(' IPQS API key not configured, skipping...');
    }
  } catch (err) {
    console.log(' IPQS check failed:', err.message);
  }

  try {
    // Final fallback: ProxyCheck.io (free tier: 1000 requests/day)
    if (process.env.PROXYCHECK_API_KEY && process.env.PROXYCHECK_API_KEY !== 'demo') {
      const proxyCheckResponse = await axios.get(`https://proxycheck.io/v2/${ip}?key=${process.env.PROXYCHECK_API_KEY}&vpn=1&asn=1`, {
        timeout: 5000
      });

      const data = proxyCheckResponse.data[ip];
      if (data && data.proxy === 'yes') {
        return {
          isVpn: true,
          provider: data.provider || data.asn || 'VPN/Proxy',
          confidence: 85,
          service: 'proxycheck'
        };
      }
    } else {
      console.log(' ProxyCheck API key not configured, skipping...');
    }
  } catch (err) {
    console.log(' ProxyCheck failed:', err.message);
  }

  // If all checks pass or fail, assume not VPN
  return { isVpn: false, provider: null, confidence: 0 };
}

module.exports = { detectVPN };
