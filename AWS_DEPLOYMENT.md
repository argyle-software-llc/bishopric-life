# AWS Deployment Documentation

## Overview

The Ward Calling Management app is deployed on AWS with the following architecture:

```
User → CloudFront (HTTPS) → EC2 (HTTP:80) → Docker Compose
                                             ├── nginx (frontend)
                                             ├── node (backend:3003)
                                             └── postgres (db:5432)
```

## AWS Resources

### EC2 Instance
- **Instance ID**: `i-05f5da04e1a35b516`
- **Type**: t4g.micro (ARM64)
- **AMI**: Amazon Linux 2023
- **Public IP**: 52.73.191.205
- **Public DNS**: ec2-52-73-191-205.compute-1.amazonaws.com
- **Name Tag**: bishopric-life

### Security Group
- **Group ID**: `sg-0844305fcb97409f8`
- **Name**: bishopric-life-sg
- **Rules**:
  - SSH (22) from specific IP
  - HTTP (80) from anywhere (for CloudFront)

### SSH Key
- **Key Name**: bishopric-life-key
- **Local Path**: `./bishopric-life-key.pem`
- **IMPORTANT**: This file is in .gitignore - never commit it

### CloudFront Distribution
- **Distribution ID**: `E33L45Y29QEMXZ`
- **Domain**: d21ia3awkyyxxz.cloudfront.net
- **Alternate Domain**: bishopric.life
- **SSL Certificate**: ACM (arn:aws:acm:us-east-1:151072803204:certificate/0db0f186-dd0c-4737-97bc-75067b01312d)
- **Cache Behaviors**:
  - `/api/*` - No caching, forwards cookies (CachingDisabled policy)
  - `/*` - Caches static assets

### Route 53
- **Hosted Zone**: Z07943772KO94AVXN52C7 (bishopric.life)
- **Records**:
  - `bishopric.life` → A record (alias to CloudFront)
  - `_5762e077ae4f60741bc0091b2fc61990.bishopric.life` → CNAME (ACM validation)

### ACM Certificate
- **ARN**: arn:aws:acm:us-east-1:151072803204:certificate/0db0f186-dd0c-4737-97bc-75067b01312d
- **Domain**: bishopric.life, *.bishopric.life
- **Region**: us-east-1 (required for CloudFront)

## Estimated Monthly Cost
- EC2 t4g.micro: ~$6
- CloudFront (low traffic): ~$0.10
- Route 53 hosted zone: $0.50
- **Total: ~$7/month**

## SSH Access

```bash
# From the project directory
ssh -i bishopric-life-key.pem ec2-user@52.73.191.205

# Or use the public DNS
ssh -i bishopric-life-key.pem ec2-user@ec2-52-73-191-205.compute-1.amazonaws.com
```

## Docker Management

All commands should be run from `/home/ec2-user/callings/` on the EC2 instance.

```bash
# View running containers
sudo docker compose ps

# View logs
sudo docker compose logs -f
sudo docker compose logs -f backend
sudo docker compose logs -f frontend
sudo docker compose logs -f db

# Restart all services
sudo docker compose restart

# Restart specific service
sudo docker compose restart backend

# Stop all services
sudo docker compose down

# Start all services
sudo docker compose up -d

# Rebuild and restart (after code changes)
sudo docker compose build
sudo docker compose up -d
```

## Database Management

```bash
# Connect to PostgreSQL
sudo docker compose exec db psql -U postgres -d ward_callings

# Add a user to allowlist
sudo docker compose exec db psql -U postgres -d ward_callings -c \
  "INSERT INTO users (email, allowed) VALUES ('email@gmail.com', true);"

# List all users
sudo docker compose exec db psql -U postgres -d ward_callings -c \
  "SELECT email, name, allowed, last_login FROM users;"

# Backup database
sudo docker compose exec db pg_dump -U postgres ward_callings > backup.sql

# Restore database
cat backup.sql | sudo docker compose exec -T db psql -U postgres -d ward_callings
```

## Deploying Code Updates

```bash
# On your local machine
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude '*.pem' \
  --exclude '.env' \
  -e "ssh -i bishopric-life-key.pem" \
  /path/to/callings/ \
  ec2-user@52.73.191.205:~/callings/

# On EC2
cd ~/callings
sudo docker compose build
sudo docker compose up -d
```

## Environment Variables

The production `.env` file is located at `/home/ec2-user/callings/.env` on EC2.

Required variables:
- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password (auto-generated)
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- `JWT_SECRET` - Secret for signing JWT tokens (auto-generated)
- `FRONTEND_URL` - https://bishopric.life

## Google OAuth Configuration

### Google Cloud Console Settings
- **Project**: Your GCP project
- **OAuth Client ID**: 126639095232-tsl3d6nil5gvo4sav4vjhd0vrud6qlsk.apps.googleusercontent.com

### Authorized JavaScript Origins
- http://localhost:3000 (development)
- https://bishopric.life (production)

### Authorized Redirect URIs
- http://localhost:3000 (development)
- https://bishopric.life (production)

## Troubleshooting

### Check if services are running
```bash
sudo docker compose ps
```

### Check backend logs for errors
```bash
sudo docker compose logs backend --tail 100
```

### Check if database is healthy
```bash
sudo docker compose exec db pg_isready -U postgres
```

### Test API endpoints
```bash
# Health check
curl https://bishopric.life/api/health

# Should return 401 (protected)
curl https://bishopric.life/api/members
```

### CloudFront not updating
CloudFront caches content. To invalidate:
```bash
aws cloudfront create-invalidation --distribution-id E33L45Y29QEMXZ --paths "/*"
```

### SSH connection refused
Check security group allows your IP:
```bash
aws ec2 describe-security-groups --group-ids sg-0844305fcb97409f8
```

Update SSH rule with your current IP:
```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress \
  --group-id sg-0844305fcb97409f8 \
  --protocol tcp --port 22 --cidr "${MY_IP}/32"
```

## Cleanup (If Needed)

To completely remove all AWS resources:

```bash
# Delete CloudFront distribution (must disable first)
aws cloudfront get-distribution-config --id E33L45Y29QEMXZ > cf-config.json
# Edit cf-config.json to set Enabled: false, then update
aws cloudfront update-distribution --id E33L45Y29QEMXZ --distribution-config file://cf-config.json --if-match ETAG
# Wait for deployment, then delete
aws cloudfront delete-distribution --id E33L45Y29QEMXZ --if-match ETAG

# Terminate EC2 instance
aws ec2 terminate-instances --instance-ids i-05f5da04e1a35b516

# Delete security group (after EC2 is terminated)
aws ec2 delete-security-group --group-id sg-0844305fcb97409f8

# Delete key pair
aws ec2 delete-key-pair --key-name bishopric-life-key
rm bishopric-life-key.pem

# Delete ACM certificate
aws acm delete-certificate --certificate-arn arn:aws:acm:us-east-1:151072803204:certificate/0db0f186-dd0c-4737-97bc-75067b01312d --region us-east-1

# Delete Route 53 records (keep hosted zone if you want to keep the domain)
# Use AWS console for this - easier than CLI
```
