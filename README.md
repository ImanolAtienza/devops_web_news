# DevOps Daily
App de noticias DevOps y AI DevOps — React + Vite + Kubernetes + ArgoCD

## Estructura
- app/      Código fuente React + Dockerfile
- k8s/      Manifiestos Kubernetes
- argocd/   Application ArgoCD

## Despliegue
cd app && docker build -t imanolAtienza/devops-daily:latest . && docker push imanolAtienza/devops-daily:latest
kubectl apply -f argocd/application.yaml
echo "127.0.0.1 devops-daily.local" | sudo tee -a /etc/hosts
