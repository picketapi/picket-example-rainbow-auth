import React, { useState, useEffect, useMemo, ReactNode } from "react";
import {
  RainbowKitAuthenticationProvider,
  createAuthenticationAdapter,
  AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { useAccount, useNetwork } from "wagmi";

import Picket, {
  SigningMessageFormat,
  PicketOptions,
} from "@picketapi/picket-js";

import { usePicket, PicketProvider } from "@picketapi/picket-react";

export interface ProviderProps extends PicketOptions {
  children?: ReactNode;
  apiKey: string;
}

export interface PicketRainbowAuthProviderProps extends ProviderProps {
  // add auth requirements once RainbowKit supports custom error messages
}

// Hardcoded map for now
// TODO: Support fetch chain info from Picket via chain ID
// only support EVM because RainbowKit only supports EVM
const chainIdToSlug: Record<number, string> = {
  1: "ethereum",
  137: "polygon",
  10: "optimism",
  42161: "arbitrum",
  43114: "avalanche",
};

const RainbowAuthProvider = ({ children }: { children?: ReactNode }) => {
  // assumes (requires) it's wrapped by Wagmi
  const { address } = useAccount();
  const { chain } = useNetwork();
  const chainSlug = chain && chainIdToSlug[chain?.id];
  const [authStatus, setAuthStatus] = useState<AuthenticationStatus>("loading");

  // assumes (requires) it's wrapped by PicketProvider
  const { isAuthenticated, isAuthenticating, auth, nonce, logout } =
    usePicket();

  // save statement after nonce is generated
  const [statement, setStatement] = useState("");
  const [messageFormat, setMessageFormat] = useState<SigningMessageFormat>(
    SigningMessageFormat.SIWE
  );

  useEffect(() => {
    // keep auth status in sync with Picket
    if (isAuthenticated) {
      setAuthStatus("authenticated");
      return;
    }
    if (isAuthenticating) {
      setAuthStatus("loading");
      return;
    }
    setAuthStatus("unauthenticated");
  }, [isAuthenticated, isAuthenticating]);

  const authenticationAdapter = useMemo(
    () =>
      createAuthenticationAdapter<string>({
        getNonce: async () => {
          console.log("get nonce");
          // should never happen if wrapped by Wagmi
          if (!address) {
            throw new Error("No wallet address");
          }
          // should never happen if wrapped by Wagmi
          if (!chain) {
            throw new Error("No chain found");
          }
          if (!chainSlug) {
            throw new Error(`Unsupported chain: ${chain.name}`);
          }
          // try / catch
          const resp = await nonce({
            walletAddress: address,
            chain: chainSlug,
            locale: navigator?.language,
          });
          setStatement(resp.statement);
          setMessageFormat(resp.format as SigningMessageFormat);
          return resp.nonce;
        },

        createMessage: ({ nonce, address, chainId }) => {
          console.log("createMessage", nonce, address, chainId);
          const domain = window.location.host;
          const uri = window.location.origin;
          const issuedAt = new Date().toISOString();

          const context = {
            domain,
            uri,
            issuedAt,
            chainId,
            // RainbowKit only supports EVM chains
            chainType: "ethereum",
            locale: navigator?.language,
          };

          const message = Picket.createSigningMessage({
            nonce,
            walletAddress: address,
            statement,
            format: messageFormat,
            ...context,
          });

          return message;
        },

        getMessageBody: ({ message }) => {
          console.log("getMessageBody", message);
          return message;
        },

        verify: async ({ signature }) => {
          console.log("verify");
          // should never happen if wrapped by Wagmi
          if (!address) {
            throw new Error("No wallet address");
          }
          // should never happen if wrapped by Wagmi
          if (!chain) {
            throw new Error("No chain found");
          }
          if (!chainSlug) {
            throw new Error(`Unsupported chain: ${chain.name}`);
          }
          const data = await auth({
            walletAddress: address,
            signature,
            chain: chainSlug,
          });
          console.log("verify return", data);
          return Boolean(data);
        },

        signOut: async () => {
          console.log("signOut");
          await logout();
        },
      }),
    [address, chain, chainSlug, auth, logout, nonce, statement, messageFormat]
  );

  return (
    <RainbowKitAuthenticationProvider
      adapter={authenticationAdapter}
      status={authStatus}
    >
      {children}
    </RainbowKitAuthenticationProvider>
  );
};

export const PicketRainbowAuthProvider = ({
  children,
  apiKey,
  ...options
}: PicketRainbowAuthProviderProps) => {
  return (
    <PicketProvider apiKey={apiKey} {...options}>
      <RainbowAuthProvider>{children}</RainbowAuthProvider>
    </PicketProvider>
  );
};
