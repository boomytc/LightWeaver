declare module "./catalog.json" {
  const value: {
    compositions: { id: string; projectId: string; locale: string; title: string }[];
  };
  export default value;
}
