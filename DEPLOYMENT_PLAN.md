# Bishopric.life Deployment Plan

## Current Status
- [x] SSH Key created: `bishopric-life-key.pem` (protected in .gitignore)
- [x] Security Group created: `sg-0844305fcb97409f8` (bishopric-life-sg)
  - SSH (22) from your IP: 99.68.155.122
  - HTTP (80) from anywhere (for CloudFront)

## Resources to Create (Isolated from existing services)

### 1. EC2 Instance
- **Type**: t4g.micro (ARM-based, cheapest)
- **AMI**: Amazon Linux 2023 (arm64)
- **Key**: bishopric-life-key
- **Security Group**: bishopric-life-sg
- **Storage**: 20GB gp3
- **Name Tag**: bishopric-life

### 2. ACM Certificate (us-east-1)
- **Domain**: bishopric.life
- **Alt Names**: *.bishopric.life (for subdomains if needed)
- **Validation**: DNS (auto-create Route 53 records)

### 3. CloudFront Distribution
- **Origin**: EC2 instance (HTTP only)
- **SSL**: ACM certificate
- **Alternate Domain**: bishopric.life
- **Cache Behavior**:
  - `/api/*` - No caching, forward cookies
  - `/*` - Cache static assets

### 4. Route 53 Records
- **A Record**: bishopric.life → CloudFront (Alias)

## Architecture
```
User → CloudFront (HTTPS/443) → EC2 (HTTP/80) → Docker Compose
                                                  ├── nginx (frontend)
                                                  ├── node (backend)
                                                  └── postgres (database)
```

## Estimated Monthly Cost
- EC2 t4g.micro: ~$6
- CloudFront (low traffic): ~$0.10
- Route 53 hosted zone: $0.50
- **Total: ~$7/month**

## What We Will NOT Touch
- Existing EC2 instances (XSSHunter, BB_API_ASG, Kali)
- Existing security groups
- Existing CloudFront distribution (bountypls.com)
- Other Route 53 hosted zones (bountypls.com, jar0m.com)

## Deployment Steps
1. Launch EC2 instance
2. Install Docker and Docker Compose
3. Clone/copy application code
4. Configure production .env
5. Start containers
6. Request ACM certificate
7. Create CloudFront distribution
8. Update Route 53 A record
9. Update Google OAuth authorized domains
10. Test end-to-end
