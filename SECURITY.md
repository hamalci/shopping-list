# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 3.3.x   | :white_check_mark: |
| < 3.3   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it by:

1. **Email**: Send details to the project maintainer
2. **GitHub Issues**: For non-critical issues only
3. **Response Time**: We aim to respond within 48 hours

## Security Features

### Current Security Measures:
- ✅ XSS Protection via input sanitization
- ✅ Safe DOM manipulation (textContent over innerHTML)
- ✅ localStorage data validation
- ✅ Firebase security rules
- ✅ HTTPS-only external resources
- ✅ Input length limitations
- ✅ Error handling for all network requests

### Recommended Browser Security:
- Use updated browsers with modern security features
- Enable JavaScript (required for app functionality)
- Allow localStorage (for saving preferences)

## Data Privacy

This application:
- 📱 Stores shopping lists locally in your browser
- 🔄 Can optionally share lists via Firebase (encrypted in transit)
- 🚫 Does NOT collect personal information
- 🚫 Does NOT use tracking cookies
- 🚫 Does NOT sell data to third parties

## Third-Party Dependencies

- **Firebase**: Google's secure cloud platform
- **Quagga2**: Barcode scanning library
- All dependencies loaded via HTTPS from trusted CDNs

---

For detailed security analysis, see [SECURITY_REPORT.md](./SECURITY_REPORT.md)
