# Amazon EKS Deployment Guide for MySpace

This guide walks you through containerizing the MySpace application, pushing the image to Amazon Elastic Container Registry (ECR), provisioning an Amazon Elastic Kubernetes Service (EKS) cluster, and deploying it with a public AWS Application Load Balancer (ALB).

---

## Prerequisites

Before starting, ensure you have the following CLI tools installed:
1. **AWS CLI** (configured with admin credentials: `aws configure`)
2. **Docker** (to build the container image)
3. **kubectl** (to interact with Kubernetes)
4. **eksctl** (the official CLI for EKS cluster management)
5. **Helm** (for installing Kubernetes packages)

---

## Step 1: Create Amazon ECR Repository & Push Image

Amazon ECR is a managed container registry. We will build our Docker image locally and push it to ECR.

1. **Set your environment variables** (replace placeholders):
   ```bash
   AWS_REGION="us-east-1"
   AWS_ACCOUNT_ID="123456789012" # Run `aws sts get-caller-identity --query Account --output text`
   REPO_NAME="myspace"
   ```

2. **Authenticate Docker to your ECR registry**:
   ```bash
   aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
   ```

3. **Create the ECR Repository**:
   ```bash
   aws ecr create-repository \
     --repository-name $REPO_NAME \
     --region $AWS_REGION \
     --image-scanning-configuration scanOnPush=true \
     --encryption-configuration encryptionType=AES256
   ```

4. **Build, Tag, and Push the Docker image**:
   ```bash
   # Build the image using the local Dockerfile
   docker build -t $REPO_NAME .

   # Tag the image for your ECR repository
   docker tag $REPO_NAME:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:latest

   # Push to ECR
   docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$REPO_NAME:latest
   ```

---

## Step 2: Provision the EKS Cluster

We will use `eksctl` to provision a cluster with a managed node group.

1. **Create the cluster**:
   ```bash
   eksctl create cluster \
     --name myspace-cluster \
     --region $AWS_REGION \
     --nodegroup-name standard-workers \
     --node-type t3.medium \
     --nodes 2 \
     --nodes-min 1 \
     --nodes-max 3 \
     --managed
   ```
   *Note: This command will take 15–20 minutes to complete as it spins up CloudFormation stacks, VPCs, and EC2 instances.*

2. **Configure your local kubeconfig** (if not done automatically):
   ```bash
   aws eks update-kubeconfig --name myspace-cluster --region $AWS_REGION
   ```

3. **Verify node status**:
   ```bash
   kubectl get nodes
   ```

---

## Step 3: Install AWS Load Balancer Controller

The Application Load Balancer (ALB) is provisioned via the AWS Load Balancer Controller.

1. **Associate IAM OIDC Provider** with your EKS cluster:
   ```bash
   eksctl utils associate-iam-oidc-provider \
     --cluster myspace-cluster \
     --region $AWS_REGION \
     --approve
   ```

2. **Download the IAM policy** for the Load Balancer Controller:
   ```bash
   curl -O https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/v2.7.2/docs/install/iam_policy.json
   ```

3. **Create the IAM Policy** in AWS:
   ```bash
   aws iam create-policy \
     --policy-name AWSLoadBalancerControllerIAMPolicy \
     --policy-document file://iam_policy.json
   ```

4. **Create a ServiceAccount** and bind it to a new IAM Role:
   ```bash
   eksctl create iamserviceaccount \
     --cluster=myspace-cluster \
     --namespace=kube-system \
     --name=aws-load-balancer-controller \
     --role-name AmazonEKSLoadBalancerControllerRole \
     --attach-policy-arn=arn:aws:iam::$AWS_ACCOUNT_ID:policy/AWSLoadBalancerControllerIAMPolicy \
     --approve \
     --region $AWS_REGION
   ```

5. **Install the controller** using Helm:
   ```bash
   # Add target Helm repo
   helm repo add eks https://aws.github.io/eks-charts
   helm repo update

   # Install AWS Load Balancer Controller
   helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
     -n kube-system \
     --set clusterName=myspace-cluster \
     --set serviceAccount.create=false \
     --set serviceAccount.name=aws-load-balancer-controller
   ```

6. **Verify the installation**:
   ```bash
   kubectl get deployment -n kube-system aws-load-balancer-controller
   ```

---

## Step 4: Deploy the Application

1. **Update the container image** in `k8s/deployment.yaml`. Replace the placeholder:
   ```yaml
   image: <AWS_ACCOUNT_ID>.dkr.ecr.<AWS_REGION>.amazonaws.com/myspace:latest
   ```
   with your actual ECR image path:
   ```yaml
   image: 123456789012.dkr.ecr.us-east-1.amazonaws.com/myspace:latest
   ```

2. **Apply the Kubernetes configurations**:
   ```bash
   kubectl apply -f k8s/
   ```

3. **Verify everything is running**:
   ```bash
   kubectl get all
   ```

4. **Get the Ingress endpoint (ALB URL)**:
   ```bash
   kubectl get ingress myspace-ingress
   ```
   Look for the `ADDRESS` column. It may take 2-3 minutes for the ALB to provision and register healthy nodes. Paste that DNS address into your browser to view your website!

---

## Step 5: Clean Up Resources

To avoid incurring ongoing AWS charges, clean up the cluster and ECR repository when you are done:

```bash
# 1. Delete Kubernetes resources (removes ALB)
kubectl delete -f k8s/

# 2. Delete EKS Cluster
eksctl delete cluster --name myspace-cluster --region $AWS_REGION

# 3. Delete ECR Repository
aws ecr delete-repository --repository-name $REPO_NAME --force --region $AWS_REGION
```
