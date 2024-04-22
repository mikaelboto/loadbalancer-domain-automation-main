import { DescribeLoadBalancersCommand , DescribeTagsCommand} from '@aws-sdk/client-elastic-load-balancing-v2'

export async function findActiveLoadbalancer(elbClient){
    console.log("Encontrando Loadbalancer...")

    const loadbalancerList = (await elbClient.send(new DescribeLoadBalancersCommand({}))).LoadBalancers
    
    const loadbalancerTags = (await elbClient.send(new DescribeTagsCommand({
        ResourceArns: loadbalancerList.map(elb => elb.LoadBalancerArn)
    }))).TagDescriptions


    let currentLoadbalancer = null
    
    for(const loadbalancer of loadbalancerTags){
        const activeTag = loadbalancer.Tags.find(tag => tag.Key === 'active' && tag.Value === 'true')

        if(activeTag){
            
            currentLoadbalancer = loadbalancerList.find(elb => elb.LoadBalancerArn === loadbalancer.ResourceArn)
            break
        }
    }

    return currentLoadbalancer
}

export function getLoadbalancerId(loadbalancerDNS){
    console.log(loadbalancerDNS)
    const subdomain = loadbalancerDNS.split('.').shift()
    console.log(subdomain)

    const id = subdomain.split('-').pop()
    console.log(id)

    return id
}